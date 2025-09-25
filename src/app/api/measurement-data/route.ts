import { NextRequest, NextResponse } from 'next/server';
import { getDB, verifyApiKey } from '@/lib/firebase-server';
import { saveDailyUsage } from '@/lib/firestore-utils';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * 測定データ受信API
 * POST /api/measurement-data
 *
 * ESP32からの最終測定データを受信してdailyUsageに記録
 */
export async function POST(request: NextRequest) {
  try {
    // API Key認証（ESP32 からの呼び出し）
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || !verifyApiKey(apiKey)) {
      return NextResponse.json({
        success: false,
        error: 'API認証が必要です'
      }, { status: 401 });
    }

    // リクエストボディ確認
    const {
      deviceId,
      sessionId,
      totalAmount,
      duration,
      endReason = 'manual'
    } = await request.json();

    // 必須パラメータ確認
    if (!deviceId || typeof deviceId !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'デバイスIDが必要です'
      }, { status: 400 });
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'セッションIDが必要です'
      }, { status: 400 });
    }

    if (typeof totalAmount !== 'number' || totalAmount < 0) {
      return NextResponse.json({
        success: false,
        error: '有効な使用量（totalAmount）が必要です'
      }, { status: 400 });
    }

    if (typeof duration !== 'number' || duration < 0) {
      return NextResponse.json({
        success: false,
        error: '有効な測定時間（duration）が必要です'
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

    // デバイスID確認
    if (sessionData.deviceId !== deviceId) {
      return NextResponse.json({
        success: false,
        error: 'セッションとデバイスIDが一致しません'
      }, { status: 400 });
    }

    // セッション状態確認（active または ending のみ受け付け）
    if (!['active', 'ending'].includes(sessionData.status)) {
      return NextResponse.json({
        success: false,
        error: `セッション状態が無効です: ${sessionData.status}`
      }, { status: 400 });
    }

    const userId = sessionData.userId;
    const currentTime = Timestamp.now();

    try {
      // ⭐ 重要：dailyUsageコレクションに水使用量を記録
      await saveDailyUsage(userId, 'water', totalAmount);

    } catch (dailyUsageError) {
      console.error('❌ dailyUsage記録失敗:', dailyUsageError);

      // dailyUsage記録失敗はクリティカルエラーとして扱う
      return NextResponse.json({
        success: false,
        error: 'dailyUsage記録に失敗しました',
        details: dailyUsageError instanceof Error ? dailyUsageError.message : String(dailyUsageError)
      }, { status: 500 });
    }

    // セッション完了更新（トランザクションで実行）
    try {
      await db.runTransaction(async (transaction) => {
        // セッション更新
        transaction.update(sessionDoc.ref, {
          endTime: currentTime,
          waterAmount: totalAmount,
          duration: duration,
          endReason: endReason,
          status: 'completed',
          completedAt: currentTime
        });

        // デバイス状態更新
        const deviceRef = db.collection('devices').doc(deviceId);
        transaction.update(deviceRef, {
          status: 'idle',
          lastSeen: currentTime,
          currentSession: null,
          lastCompletedSession: sessionId
        });
      });

    } catch (transactionError) {
      console.error('❌ トランザクション失敗:', transactionError);

      return NextResponse.json({
        success: false,
        error: 'セッション完了処理に失敗しました',
        details: transactionError instanceof Error ? transactionError.message : String(transactionError)
      }, { status: 500 });
    }

    // 成功レスポンス
    return NextResponse.json({
      success: true,
      data: {
        sessionId: sessionId,
        userId: userId,
        deviceId: deviceId,
        waterAmount: totalAmount,
        duration: duration,
        endReason: endReason,
        recordedToDaily: true, // ⭐ dailyUsageに記録済み
        completedAt: currentTime.toDate().toISOString(),
        message: `測定データを正常に受信し、dailyUsageに記録しました（${totalAmount}L）`
      }
    });

  } catch (error) {
    console.error('❌ Measurement data processing error:', error);
    return NextResponse.json({
      success: false,
      error: '測定データ処理中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

/**
 * 測定データ履歴取得API
 * GET /api/measurement-data?sessionId=xxx または GET /api/measurement-data?userId=xxx&limit=10
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
    const userId = url.searchParams.get('userId');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    const db = getDB();
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'データベースに接続できません'
      }, { status: 500 });
    }

    if (sessionId) {
      // 特定セッションの詳細情報
      const sessionDoc = await db.collection('water_usage_sessions').doc(sessionId).get();
      if (!sessionDoc.exists) {
        return NextResponse.json({
          success: false,
          error: 'セッションが見つかりません'
        }, { status: 404 });
      }

      const sessionData = sessionDoc.data()!;
      return NextResponse.json({
        success: true,
        data: {
          sessionId: sessionId,
          userId: sessionData.userId,
          deviceId: sessionData.deviceId,
          cardId: sessionData.cardId,
          startTime: sessionData.startTime?.toDate?.()?.toISOString() || sessionData.startTime,
          endTime: sessionData.endTime?.toDate?.()?.toISOString() || sessionData.endTime,
          waterAmount: sessionData.waterAmount || 0,
          duration: sessionData.duration || 0,
          endReason: sessionData.endReason || null,
          status: sessionData.status
        }
      });

    } else if (userId) {
      // ユーザーの測定履歴（完了済みセッションのみ）
      const sessionsSnapshot = await db.collection('water_usage_sessions')
        .where('userId', '==', userId)
        .where('status', '==', 'completed')
        .orderBy('endTime', 'desc')
        .limit(limit)
        .get();

      const sessions = sessionsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          sessionId: doc.id,
          deviceId: data.deviceId,
          startTime: data.startTime?.toDate?.()?.toISOString() || data.startTime,
          endTime: data.endTime?.toDate?.()?.toISOString() || data.endTime,
          waterAmount: data.waterAmount || 0,
          duration: data.duration || 0,
          endReason: data.endReason || null
        };
      });

      // 合計使用量計算
      const totalWaterAmount = sessions.reduce((sum, session) => sum + (session.waterAmount || 0), 0);

      return NextResponse.json({
        success: true,
        data: {
          userId: userId,
          totalSessions: sessions.length,
          totalWaterAmount: totalWaterAmount,
          sessions: sessions
        }
      });

    } else {
      return NextResponse.json({
        success: false,
        error: 'sessionIdまたはuserIdが必要です'
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Get measurement data error:', error);
    return NextResponse.json({
      success: false,
      error: '測定データ取得中にエラーが発生しました'
    }, { status: 500 });
  }
}

/**
 * 測定データ修正API（管理者用）
 * PATCH /api/measurement-data
 */
export async function PATCH(request: NextRequest) {
  try {
    // API Key認証
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || !verifyApiKey(apiKey)) {
      return NextResponse.json({
        success: false,
        error: 'API認証が必要です'
      }, { status: 401 });
    }

    const { sessionId, waterAmount, endReason } = await request.json();

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
    const userId = sessionData.userId;
    const oldWaterAmount = sessionData.waterAmount || 0;

    // 修正データでセッション更新
    const updateData: Record<string, unknown> = {
      lastModifiedAt: Timestamp.now(),
      modifiedBy: 'admin' // 実際の管理者IDを設定することも可能
    };

    if (typeof waterAmount === 'number' && waterAmount >= 0) {
      updateData.waterAmount = waterAmount;
      updateData.originalWaterAmount = oldWaterAmount; // 元の値を保存
    }

    if (endReason && typeof endReason === 'string') {
      updateData.endReason = endReason;
      updateData.originalEndReason = sessionData.endReason; // 元の値を保存
    }

    await sessionDoc.ref.update(updateData);

    // dailyUsage の差分調整（waterAmount が変更された場合）
    if (typeof waterAmount === 'number' && waterAmount !== oldWaterAmount) {
      const difference = waterAmount - oldWaterAmount;

      try {
        await saveDailyUsage(userId, 'water', difference);
        } catch (error) {
        console.error('❌ dailyUsage差分調整失敗:', error);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: sessionId,
        userId: userId,
        oldWaterAmount: oldWaterAmount,
        newWaterAmount: waterAmount,
        message: '測定データが修正されました'
      }
    });

  } catch (error) {
    console.error('Patch measurement data error:', error);
    return NextResponse.json({
      success: false,
      error: '測定データ修正中にエラーが発生しました'
    }, { status: 500 });
  }
}