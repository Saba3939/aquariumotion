import { NextRequest, NextResponse } from 'next/server';
import { getDB, verifyApiKey, sendDeviceCommand } from '@/lib/firebase-server';
import { saveDailyUsage } from '@/lib/firestore-utils';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * セッション強制終了API
 * POST /api/force-end-session
 *
 * 割り込み、タイムアウト、システム障害時のセッション強制終了
 */
export async function POST(request: NextRequest) {
  try {
    // API Key認証
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || !verifyApiKey(apiKey)) {
      return NextResponse.json({
        success: false,
        error: 'API認証が必要です'
      }, { status: 401 });
    }

    // リクエストボディ確認
    const {
      sessionId,
      reason,
      estimatedAmount = 0,
      forceComplete = false
    } = await request.json();

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'セッションIDが必要です'
      }, { status: 400 });
    }

    if (!reason || typeof reason !== 'string') {
      return NextResponse.json({
        success: false,
        error: '強制終了理由が必要です'
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

    // 強制終了可能な状態かチェック
    if (!['active', 'ending'].includes(sessionData.status)) {
      return NextResponse.json({
        success: false,
        error: `セッション状態 ${sessionData.status} では強制終了できません`
      }, { status: 400 });
    }

    const userId = sessionData.userId;
    const deviceId = sessionData.deviceId;
    const currentTime = Timestamp.now();

    // セッション開始からの経過時間計算
    const startTime = sessionData.startTime?.toDate?.() || new Date(sessionData.startTime);
    const duration = Math.floor((currentTime.toDate().getTime() - startTime.getTime()) / 1000);

    const finalWaterAmount = estimatedAmount;
    let dailyUsageRecorded = false;

    // ESP32に強制停止コマンド送信（通信できる場合）
    try {
      await sendDeviceCommand(deviceId, {
        command: 'force_stop',
        sessionId: sessionId,
        reason: reason
      });
      console.log(`✅ ESP32に強制停止コマンド送信: deviceId=${deviceId}, reason=${reason}`);
    } catch (deviceError) {
      console.warn(`⚠️  ESP32通信失敗: ${deviceError}`);
      // ESP32通信失敗でも処理を続行
    }

    // 強制完了の場合は推定使用量でdailyUsage記録
    if (forceComplete && estimatedAmount > 0) {
      try {
        await saveDailyUsage(userId, 'water', estimatedAmount);
        dailyUsageRecorded = true;
        console.log(`✅ 推定使用量でdailyUsage記録: userId=${userId}, water=${estimatedAmount}L`);
      } catch (dailyUsageError) {
        console.error(`❌ dailyUsage記録失敗: ${dailyUsageError}`);
        // dailyUsage記録失敗でも強制終了は続行
      }
    }

    // 強制終了理由に応じた処理
    let status = 'force_ended';
    const additionalData: Record<string, unknown> = {};

    switch (reason) {
      case 'interrupted':
        status = 'force_ended';
        additionalData.interruptedBy = 'new_user';
        break;

      case 'timeout':
      case 'session_timeout':
        status = 'timeout';
        additionalData.timeoutType = 'session';
        break;

      case 'no_flow_timeout':
        status = 'timeout';
        additionalData.timeoutType = 'no_flow';
        break;

      case 'device_offline':
      case 'communication_failure':
        status = 'failed';
        additionalData.failureType = 'device_communication';
        if (estimatedAmount > 0) {
          additionalData.estimatedAmount = estimatedAmount;
        }
        break;

      case 'system_maintenance':
        status = 'force_ended';
        additionalData.maintenanceMode = true;
        break;

      default:
        status = 'force_ended';
        additionalData.customReason = reason;
    }

    // セッション強制終了の実行（トランザクション）
    try {
      await db.runTransaction(async (transaction) => {
        // セッション更新
        transaction.update(sessionDoc.ref, {
          endTime: currentTime,
          waterAmount: finalWaterAmount,
          duration: duration,
          endReason: reason,
          status: status,
          forceEnded: true,
          forceEndReason: reason,
          dailyUsageRecorded: dailyUsageRecorded,
          ...additionalData
        });

        // デバイス状態をアイドルに戻す
        const deviceRef = db.collection('devices').doc(deviceId);
        transaction.update(deviceRef, {
          status: 'idle',
          lastSeen: currentTime,
          currentSession: null,
          lastForceEndedSession: sessionId
        });
      });

      console.log(`✅ セッション強制終了完了: sessionId=${sessionId}, reason=${reason}`);

    } catch (transactionError) {
      console.error(`❌ 強制終了トランザクション失敗: ${transactionError}`);
      return NextResponse.json({
        success: false,
        error: 'セッション強制終了処理に失敗しました',
        details: transactionError instanceof Error ? transactionError.message : String(transactionError)
      }, { status: 500 });
    }

    // 管理者ログ記録
    try {
      await db.collection('admin_logs').add({
        action: 'force_end_session',
        sessionId: sessionId,
        userId: userId,
        deviceId: deviceId,
        reason: reason,
        estimatedAmount: estimatedAmount,
        duration: duration,
        dailyUsageRecorded: dailyUsageRecorded,
        timestamp: currentTime,
        executedBy: 'system' // 実際の管理者IDがある場合は設定
      });
    } catch (logError) {
      console.warn(`⚠️  管理者ログ記録失敗: ${logError}`);
      // ログ失敗は無視
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: sessionId,
        userId: userId,
        deviceId: deviceId,
        reason: reason,
        status: status,
        duration: duration,
        waterAmount: finalWaterAmount,
        dailyUsageRecorded: dailyUsageRecorded,
        forceEndedAt: currentTime.toDate().toISOString(),
        message: `セッションを強制終了しました（理由: ${reason}）`
      }
    });

  } catch (error) {
    console.error('❌ Force end session error:', error);
    return NextResponse.json({
      success: false,
      error: 'セッション強制終了中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

/**
 * 強制終了可能セッション一覧API
 * GET /api/force-end-session
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

    const db = getDB();
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'データベースに接続できません'
      }, { status: 500 });
    }

    // アクティブまたは終了待ちセッションを取得
    const activeSessionsSnapshot = await db.collection('water_usage_sessions')
      .where('status', 'in', ['active', 'ending'])
      .orderBy('startTime', 'desc')
      .limit(50)
      .get();

    const currentTime = new Date();
    const sessions = activeSessionsSnapshot.docs.map(doc => {
      const data = doc.data();
      const startTime = data.startTime?.toDate?.() || new Date(data.startTime);
      const duration = Math.floor((currentTime.getTime() - startTime.getTime()) / 1000);

      // 強制終了の緊急度判定
      let urgency = 'normal';
      if (duration > 1800) { // 30分以上
        urgency = 'high';
      } else if (duration > 900) { // 15分以上
        urgency = 'medium';
      }

      // 推定使用量計算（平均流量2L/minで計算）
      const estimatedAmount = Math.max(0, (duration / 60) * 2.0);

      return {
        sessionId: doc.id,
        userId: data.userId,
        deviceId: data.deviceId,
        cardId: data.cardId,
        status: data.status,
        startTime: startTime.toISOString(),
        duration: duration,
        urgency: urgency,
        estimatedAmount: Math.round(estimatedAmount * 100) / 100, // 小数点第2位まで
        canForceEnd: true
      };
    });

    // 緊急度別の統計
    const stats = {
      total: sessions.length,
      high: sessions.filter(s => s.urgency === 'high').length,
      medium: sessions.filter(s => s.urgency === 'medium').length,
      normal: sessions.filter(s => s.urgency === 'normal').length
    };

    return NextResponse.json({
      success: true,
      data: {
        sessions: sessions,
        stats: stats,
        timestamp: currentTime.toISOString()
      }
    });

  } catch (error) {
    console.error('Get force-endable sessions error:', error);
    return NextResponse.json({
      success: false,
      error: '強制終了可能セッション取得中にエラーが発生しました'
    }, { status: 500 });
  }
}

/**
 * バルク強制終了API（システムメンテナンス用）
 * DELETE /api/force-end-session
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

    const { reason = 'system_maintenance', deviceIds = [] } = await request.json();

    const db = getDB();
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'データベースに接続できません'
      }, { status: 500 });
    }

    // 対象セッション特定
    let query = db.collection('water_usage_sessions').where('status', 'in', ['active', 'ending']);

    if (deviceIds.length > 0) {
      query = query.where('deviceId', 'in', deviceIds);
    }

    const sessionsSnapshot = await query.get();

    if (sessionsSnapshot.empty) {
      return NextResponse.json({
        success: true,
        data: {
          forcedSessions: 0,
          message: '強制終了対象のセッションがありませんでした'
        }
      });
    }

    // バッチ処理で一括強制終了
    const batch = db.batch();
    const currentTime = Timestamp.now();
    const forcedSessions: Array<{sessionId: string, userId: string, deviceId: string, duration: number}> = [];

    for (const sessionDoc of sessionsSnapshot.docs) {
      const sessionData = sessionDoc.data();
      const startTime = sessionData.startTime?.toDate?.() || new Date(sessionData.startTime);
      const duration = Math.floor((currentTime.toDate().getTime() - startTime.getTime()) / 1000);

      // セッション強制終了
      batch.update(sessionDoc.ref, {
        endTime: currentTime,
        endReason: reason,
        status: 'force_ended',
        forceEnded: true,
        duration: duration,
        bulkForceEnded: true
      });

      // デバイス状態更新
      const deviceRef = db.collection('devices').doc(sessionData.deviceId);
      batch.update(deviceRef, {
        status: 'idle',
        lastSeen: currentTime,
        currentSession: null
      });

      forcedSessions.push({
        sessionId: sessionDoc.id,
        userId: sessionData.userId,
        deviceId: sessionData.deviceId,
        duration: duration
      });

      // ESP32に停止コマンド送信（ベストエフォート）
      try {
        await sendDeviceCommand(sessionData.deviceId, {
          command: 'force_stop',
          sessionId: sessionDoc.id,
          reason: reason
        });
      } catch {
        console.warn(`ESP32停止コマンド送信失敗: ${sessionData.deviceId}`);
      }
    }

    // バッチ実行
    await batch.commit();

    // 管理者ログ記録
    try {
      await db.collection('admin_logs').add({
        action: 'bulk_force_end_sessions',
        reason: reason,
        deviceIds: deviceIds,
        forcedSessionsCount: forcedSessions.length,
        forcedSessions: forcedSessions,
        timestamp: currentTime,
        executedBy: 'system'
      });
    } catch (logError) {
      console.warn(`管理者ログ記録失敗: ${logError}`);
    }

    return NextResponse.json({
      success: true,
      data: {
        forcedSessions: forcedSessions.length,
        sessions: forcedSessions,
        reason: reason,
        message: `${forcedSessions.length}件のセッションを一括強制終了しました`
      }
    });

  } catch (error) {
    console.error('Bulk force end sessions error:', error);
    return NextResponse.json({
      success: false,
      error: '一括強制終了中にエラーが発生しました'
    }, { status: 500 });
  }
}