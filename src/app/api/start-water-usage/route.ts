import { NextRequest, NextResponse } from 'next/server';
import { getDB, verifyApiKey, sendDeviceCommand } from '@/lib/firebase-server';
import { Timestamp } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';

/**
 * 水使用開始API
 * POST /api/start-water-usage
 *
 * ICカードタッチによる水使用測定開始
 */
export async function POST(request: NextRequest) {
  try {
    // API Key認証（Raspberry Pi からの呼び出し）
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || !verifyApiKey(apiKey)) {
      return NextResponse.json({
        success: false,
        error: 'API認証が必要です'
      }, { status: 401 });
    }

    // リクエストボディ確認
    const { cardId, deviceId } = await request.json();

    if (!cardId || typeof cardId !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'カードIDが必要です'
      }, { status: 400 });
    }

    if (!deviceId || typeof deviceId !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'デバイスIDが必要です'
      }, { status: 400 });
    }

    const db = getDB();
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'データベースに接続できません'
      }, { status: 500 });
    }

    // ICカード認証 - usersコレクションから該当ユーザーを検索
    const usersWithCard = await db.collection('users')
      .where('icCardId', '==', cardId)
      .get();

    if (usersWithCard.empty) {
      return NextResponse.json({
        success: false,
        error: '登録されていないICカードです'
      }, { status: 403 });
    }

    const userDoc = usersWithCard.docs[0];
    const userId = userDoc.id;
    const userData = userDoc.data()!;

    // 既存のアクティブセッションをチェック
    const activeSessionsSnapshot = await db.collection('water_usage_sessions')
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .get();

    // 同じユーザーの既存セッションがある場合は先に終了
    if (!activeSessionsSnapshot.empty) {
      const existingSession = activeSessionsSnapshot.docs[0];
      const existingSessionData = existingSession.data();

      // 既存セッションを強制終了
      await existingSession.ref.update({
        endTime: Timestamp.now(),
        endReason: 'interrupted_by_new_session',
        status: 'force_ended'
      });

      // ESP32に強制停止コマンド送信
      try {
        await sendDeviceCommand(existingSessionData.deviceId, {
          command: 'force_stop',
          sessionId: existingSession.id,
          reason: 'new_session_started'
        });
      } catch (error) {
        console.warn('Failed to send force stop command:', error);
      }
    }

    // デバイス状態確認
    const deviceDoc = await db.collection('devices').doc(deviceId).get();
    if (!deviceDoc.exists) {
      return NextResponse.json({
        success: false,
        error: '指定されたデバイスが見つかりません'
      }, { status: 404 });
    }

    const deviceData = deviceDoc.data()!;
    if (deviceData.deviceType !== 'water') {
      return NextResponse.json({
        success: false,
        error: '水使用量測定デバイスではありません'
      }, { status: 400 });
    }

    // 新しいセッション作成
    const sessionId = `session_${Date.now()}_${uuidv4().slice(0, 8)}`;
    const currentTime = Timestamp.now();

    const sessionData = {
      userId: userId,
      cardId: cardId,
      deviceId: deviceId,
      startTime: currentTime,
      status: 'active',
      endTime: null,
      waterAmount: null,
      duration: null,
      endReason: null
    };

    await db.collection('water_usage_sessions').doc(sessionId).set(sessionData);

    // ESP32にリアルタイムでコマンド送信
    try {
      await sendDeviceCommand(deviceId, {
        command: 'start_measurement',
        sessionId: sessionId,
        userId: userId,
        userName: userData.name || 'Unknown User'
      });
    } catch {
      // コマンド送信失敗時はセッションを失敗状態に
      await db.collection('water_usage_sessions').doc(sessionId).update({
        status: 'failed',
        endReason: 'device_communication_failed',
        endTime: Timestamp.now()
      });

      return NextResponse.json({
        success: false,
        error: 'デバイスとの通信に失敗しました'
      }, { status: 500 });
    }

    // ICカード最終使用時刻更新
    await db.collection('users').doc(userId).update({
      icCardLastUsedAt: currentTime
    });

    // デバイス状態更新
    await db.collection('devices').doc(deviceId).update({
      status: 'measuring',
      lastSeen: currentTime,
      currentSession: sessionId
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: sessionId,
        userId: userId,
        userName: userData.name || 'Unknown User',
        deviceId: deviceId,
        startTime: currentTime.toDate().toISOString(),
        message: '水使用測定を開始しました'
      }
    });

  } catch (error) {
    console.error('Start water usage error:', error);
    return NextResponse.json({
      success: false,
      error: '使用開始処理中にエラーが発生しました'
    }, { status: 500 });
  }
}

/**
 * アクティブセッション確認API
 * GET /api/start-water-usage?userId=xxx または GET /api/start-water-usage?deviceId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    // API Key認証
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || !verifyApiKey(apiKey)) {
      return NextResponse.json({
        success: false,
        error: 'API認証が必要です'
      }, { status: 401 });
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const deviceId = url.searchParams.get('deviceId');
    const cardId = url.searchParams.get('cardId');

    if (!userId && !deviceId && !cardId) {
      return NextResponse.json({
        success: false,
        error: 'userId、deviceId、またはcardIdのいずれかが必要です'
      }, { status: 400 });
    }

    const db = getDB();
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'データベースに接続できません'
      }, { status: 500 });
    }

    let query = db.collection('water_usage_sessions').where('status', '==', 'active');

    if (userId) {
      query = query.where('userId', '==', userId);
    } else if (deviceId) {
      query = query.where('deviceId', '==', deviceId);
    } else if (cardId) {
      query = query.where('cardId', '==', cardId);
    }

    const activeSessionsSnapshot = await query.get();

    if (activeSessionsSnapshot.empty) {
      return NextResponse.json({
        success: true,
        data: {
          hasActiveSession: false,
          message: 'アクティブなセッションはありません'
        }
      });
    }

    const sessionDoc = activeSessionsSnapshot.docs[0];
    const sessionData = sessionDoc.data();

    return NextResponse.json({
      success: true,
      data: {
        hasActiveSession: true,
        sessionId: sessionDoc.id,
        userId: sessionData.userId,
        deviceId: sessionData.deviceId,
        startTime: sessionData.startTime?.toDate?.()?.toISOString() || sessionData.startTime,
        duration: Date.now() - (sessionData.startTime?.toDate?.()?.getTime() || 0)
      }
    });

  } catch (error) {
    console.error('Get active session error:', error);
    return NextResponse.json({
      success: false,
      error: 'アクティブセッション確認中にエラーが発生しました'
    }, { status: 500 });
  }
}