import { NextRequest, NextResponse } from 'next/server';
import { getDB, verifyApiKey, sendDeviceCommand } from '@/lib/firebase-server';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * 水使用終了API
 * POST /api/end-water-usage
 *
 * ICカード再タッチによる水使用測定終了
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
    const { cardId, sessionId } = await request.json();

    if (!cardId || typeof cardId !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'カードIDが必要です'
      }, { status: 400 });
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'セッションIDが必要です'
      }, { status: 400 });
    }

    const db = getDB();
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'データベースに接続できません'
      }, { status: 500 });
    }

    // セッション存在確認
    const sessionDoc = await db.collection('water_usage_sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return NextResponse.json({
        success: false,
        error: 'セッションが見つかりません'
      }, { status: 404 });
    }

    const sessionData = sessionDoc.data()!;

    // セッション状態確認
    if (sessionData.status !== 'active') {
      return NextResponse.json({
        success: false,
        error: `セッションは既に${sessionData.status}状態です`
      }, { status: 400 });
    }

    // カードID確認（同じカードでの終了かチェック）
    if (sessionData.cardId !== cardId) {
      return NextResponse.json({
        success: false,
        error: 'セッション開始時と異なるICカードです'
      }, { status: 403 });
    }

    // ICカード有効性確認
    const usersWithCard = await db.collection('users')
      .where('icCardId', '==', cardId)
      .get();

    if (usersWithCard.empty) {
      return NextResponse.json({
        success: false,
        error: '無効なICカードです'
      }, { status: 403 });
    }

    // ESP32に停止コマンド送信
    try {
      await sendDeviceCommand(sessionData.deviceId, {
        command: 'stop_measurement',
        sessionId: sessionId,
        reason: 'manual_stop'
      });
    } catch (error) {
      console.warn('Failed to send stop command to ESP32:', error);
      // ESP32通信失敗でもセッション終了処理は続行
    }

    // セッション終了準備（ESP32からの最終データ待ち状態）
    await sessionDoc.ref.update({
      endRequestTime: Timestamp.now(),
      endReason: 'manual',
      status: 'ending' // ESP32からの最終データ待ち
    });

    // ICカード最終使用時刻更新
    const cardUserDoc = usersWithCard.docs[0];
    await db.collection('users').doc(cardUserDoc.id).update({
      icCardLastUsedAt: Timestamp.now()
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: sessionId,
        userId: sessionData.userId,
        deviceId: sessionData.deviceId,
        message: '使用終了指示を送信しました。測定データの受信をお待ちください。'
      }
    });

  } catch (error) {
    console.error('End water usage error:', error);
    return NextResponse.json({
      success: false,
      error: '使用終了処理中にエラーが発生しました'
    }, { status: 500 });
  }
}

/**
 * セッション状態確認API
 * GET /api/end-water-usage?sessionId=xxx
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
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({
        success: false,
        error: 'セッションIDが必要です'
      }, { status: 400 });
    }

    const db = getDB();
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'データベースに接続できません'
      }, { status: 500 });
    }

    // セッション情報取得
    const sessionDoc = await db.collection('water_usage_sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return NextResponse.json({
        success: false,
        error: 'セッションが見つかりません'
      }, { status: 404 });
    }

    const sessionData = sessionDoc.data()!;

    // セッション状態に応じた詳細情報
    let statusDetails = {};
    const currentTime = new Date();
    const startTime = sessionData.startTime?.toDate?.() || new Date(sessionData.startTime);

    switch (sessionData.status) {
      case 'active':
        statusDetails = {
          status: 'active',
          message: '測定中',
          duration: Math.floor((currentTime.getTime() - startTime.getTime()) / 1000), // 秒
          canEnd: true
        };
        break;

      case 'ending':
        const endRequestTime = sessionData.endRequestTime?.toDate?.() || new Date(sessionData.endRequestTime);
        statusDetails = {
          status: 'ending',
          message: 'ESP32からの最終データ待ち',
          duration: Math.floor((endRequestTime.getTime() - startTime.getTime()) / 1000),
          waitingTime: Math.floor((currentTime.getTime() - endRequestTime.getTime()) / 1000),
          canEnd: false
        };
        break;

      case 'completed':
        const endTime = sessionData.endTime?.toDate?.() || new Date(sessionData.endTime);
        statusDetails = {
          status: 'completed',
          message: '測定完了',
          duration: Math.floor((endTime.getTime() - startTime.getTime()) / 1000),
          waterAmount: sessionData.waterAmount || 0,
          endReason: sessionData.endReason || 'unknown',
          canEnd: false
        };
        break;

      case 'failed':
      case 'force_ended':
        statusDetails = {
          status: sessionData.status,
          message: sessionData.status === 'failed' ? '測定失敗' : '強制終了',
          endReason: sessionData.endReason || 'unknown',
          canEnd: false
        };
        break;

      default:
        statusDetails = {
          status: sessionData.status,
          message: '不明な状態',
          canEnd: false
        };
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: sessionId,
        userId: sessionData.userId,
        deviceId: sessionData.deviceId,
        cardId: sessionData.cardId,
        startTime: startTime.toISOString(),
        ...statusDetails
      }
    });

  } catch (error) {
    console.error('Get session status error:', error);
    return NextResponse.json({
      success: false,
      error: 'セッション状態確認中にエラーが発生しました'
    }, { status: 500 });
  }
}

/**
 * セッション強制終了API（タイムアウト用）
 * DELETE /api/end-water-usage?sessionId=xxx&reason=timeout
 */
export async function DELETE(request: NextRequest) {
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
    const sessionId = url.searchParams.get('sessionId');
    const reason = url.searchParams.get('reason') || 'force_end';

    if (!sessionId) {
      return NextResponse.json({
        success: false,
        error: 'セッションIDが必要です'
      }, { status: 400 });
    }

    const db = getDB();
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'データベースに接続できません'
      }, { status: 500 });
    }

    // セッション存在確認
    const sessionDoc = await db.collection('water_usage_sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return NextResponse.json({
        success: false,
        error: 'セッションが見つかりません'
      }, { status: 404 });
    }

    const sessionData = sessionDoc.data()!;

    // アクティブまたは終了待ちセッションのみ強制終了可能
    if (!['active', 'ending'].includes(sessionData.status)) {
      return NextResponse.json({
        success: false,
        error: `セッション状態${sessionData.status}では強制終了できません`
      }, { status: 400 });
    }

    // ESP32に強制停止コマンド送信
    try {
      await sendDeviceCommand(sessionData.deviceId, {
        command: 'force_stop',
        sessionId: sessionId,
        reason: reason
      });
    } catch (error) {
      console.warn('Failed to send force stop command:', error);
    }

    // セッション強制終了
    await sessionDoc.ref.update({
      endTime: Timestamp.now(),
      endReason: reason,
      status: 'force_ended'
    });

    // デバイス状態をアイドルに戻す
    await db.collection('devices').doc(sessionData.deviceId).update({
      status: 'idle',
      lastSeen: Timestamp.now(),
      currentSession: null
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: sessionId,
        userId: sessionData.userId,
        deviceId: sessionData.deviceId,
        reason: reason,
        message: `セッションを強制終了しました（理由: ${reason}）`
      }
    });

  } catch (error) {
    console.error('Force end session error:', error);
    return NextResponse.json({
      success: false,
      error: 'セッション強制終了中にエラーが発生しました'
    }, { status: 500 });
  }
}