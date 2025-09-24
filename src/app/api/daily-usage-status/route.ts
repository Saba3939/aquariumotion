import { NextRequest, NextResponse } from 'next/server';
import { getDB, verifyApiKey } from '@/lib/firebase-server';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * dailyUsage記録確認API
 * GET /api/daily-usage-status?userId=xxx&date=2024-01-01
 *
 * 水使用量のdailyUsage記録状況を確認するためのAPI
 * システム監視・デバッグ用
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
    const dateParam = url.searchParams.get('date'); // YYYY-MM-DD形式
    const limit = parseInt(url.searchParams.get('limit') || '7'); // デフォルト7日分

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'userIdが必要です'
      }, { status: 400 });
    }

    const db = getDB();
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'データベースに接続できません'
      }, { status: 500 });
    }

    // 特定日のdailyUsage確認
    if (dateParam) {
      const dailyUsageId = `${userId}_${dateParam}`;
      const dailyUsageDoc = await db.collection('dailyUsage').doc(dailyUsageId).get();

      if (!dailyUsageDoc.exists) {
        return NextResponse.json({
          success: true,
          data: {
            userId: userId,
            date: dateParam,
            hasRecord: false,
            waterUsage: 0,
            message: '指定日のdailyUsage記録がありません'
          }
        });
      }

      const dailyUsageData = dailyUsageDoc.data()!;

      // 同じ日の水使用セッション一覧を取得
      const startOfDay = new Date(dateParam + 'T00:00:00Z');
      const endOfDay = new Date(dateParam + 'T23:59:59Z');

      const sessionsSnapshot = await db.collection('water_usage_sessions')
        .where('userId', '==', userId)
        .where('startTime', '>=', Timestamp.fromDate(startOfDay))
        .where('startTime', '<=', Timestamp.fromDate(endOfDay))
        .where('status', '==', 'completed')
        .orderBy('startTime', 'asc')
        .get();

      const sessions = sessionsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          sessionId: doc.id,
          startTime: data.startTime?.toDate?.()?.toISOString() || data.startTime,
          endTime: data.endTime?.toDate?.()?.toISOString() || data.endTime,
          waterAmount: data.waterAmount || 0,
          duration: data.duration || 0,
          endReason: data.endReason || null
        };
      });

      // セッション合計と記録値の差分確認
      const sessionTotal = sessions.reduce((sum, session) => sum + (session.waterAmount || 0), 0);
      const recordedAmount = dailyUsageData.waterUsage || 0;
      const difference = Math.abs(sessionTotal - recordedAmount);

      return NextResponse.json({
        success: true,
        data: {
          userId: userId,
          date: dateParam,
          hasRecord: true,
          dailyUsage: {
            waterUsage: recordedAmount,
            lastUpdated: dailyUsageData.lastUpdated?.toDate?.()?.toISOString() || dailyUsageData.lastUpdated,
            updateCount: dailyUsageData.updateCount || 0
          },
          sessions: {
            count: sessions.length,
            totalWaterAmount: sessionTotal,
            sessions: sessions
          },
          verification: {
            isMatching: difference < 0.01, // 小数点以下の誤差は許容
            difference: Math.round(difference * 100) / 100, // 小数点第2位まで
            status: difference < 0.01 ? 'consistent' : 'inconsistent'
          }
        }
      });
    }

    // 複数日のdailyUsage概要確認
    const today = new Date();
    const dates: string[] = [];

    for (let i = 0; i < limit; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]); // YYYY-MM-DD形式
    }

    const dailyUsagePromises = dates.map(async (date) => {
      const dailyUsageId = `${userId}_${date}`;
      const dailyUsageDoc = await db.collection('dailyUsage').doc(dailyUsageId).get();

      return {
        date: date,
        hasRecord: dailyUsageDoc.exists,
        waterUsage: dailyUsageDoc.exists ? (dailyUsageDoc.data()?.waterUsage || 0) : 0,
        lastUpdated: dailyUsageDoc.exists ?
          (dailyUsageDoc.data()?.lastUpdated?.toDate?.()?.toISOString() || dailyUsageDoc.data()?.lastUpdated) :
          null
      };
    });

    const dailyUsageResults = await Promise.all(dailyUsagePromises);

    // 統計情報計算
    const totalWaterUsage = dailyUsageResults.reduce((sum, day) => sum + day.waterUsage, 0);
    const daysWithRecords = dailyUsageResults.filter(day => day.hasRecord).length;
    const averageDaily = daysWithRecords > 0 ? totalWaterUsage / daysWithRecords : 0;

    return NextResponse.json({
      success: true,
      data: {
        userId: userId,
        period: {
          from: dates[dates.length - 1],
          to: dates[0],
          days: limit
        },
        summary: {
          totalWaterUsage: Math.round(totalWaterUsage * 100) / 100,
          daysWithRecords: daysWithRecords,
          averageDaily: Math.round(averageDaily * 100) / 100,
          recordingRate: Math.round((daysWithRecords / limit) * 100) // パーセンテージ
        },
        dailyData: dailyUsageResults
      }
    });

  } catch (error) {
    console.error('Get daily usage status error:', error);
    return NextResponse.json({
      success: false,
      error: 'dailyUsage状況確認中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

/**
 * dailyUsage整合性チェックAPI
 * POST /api/daily-usage-status
 *
 * 指定期間のdailyUsageとセッションデータの整合性を一括チェック
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

    const { userId, startDate, endDate } = await request.json();

    if (!userId || !startDate || !endDate) {
      return NextResponse.json({
        success: false,
        error: 'userId、startDate、endDateが必要です'
      }, { status: 400 });
    }

    const db = getDB();
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'データベースに接続できません'
      }, { status: 500 });
    }

    // 期間内の全セッションを取得
    const startOfPeriod = new Date(startDate + 'T00:00:00Z');
    const endOfPeriod = new Date(endDate + 'T23:59:59Z');

    const sessionsSnapshot = await db.collection('water_usage_sessions')
      .where('userId', '==', userId)
      .where('startTime', '>=', Timestamp.fromDate(startOfPeriod))
      .where('startTime', '<=', Timestamp.fromDate(endOfPeriod))
      .where('status', '==', 'completed')
      .orderBy('startTime', 'asc')
      .get();

    // 日付別にセッションをグループ化
    const sessionsByDate: { [date: string]: Array<{sessionId: string, waterAmount: number, duration: number, startTime: string, endTime: string}> } = {};

    sessionsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const sessionDate = (data.startTime?.toDate?.() || new Date(data.startTime)).toISOString().split('T')[0];

      if (!sessionsByDate[sessionDate]) {
        sessionsByDate[sessionDate] = [];
      }

      sessionsByDate[sessionDate].push({
        sessionId: doc.id,
        waterAmount: data.waterAmount || 0,
        duration: data.duration || 0,
        startTime: data.startTime?.toDate?.()?.toISOString() || data.startTime,
        endTime: data.endTime?.toDate?.()?.toISOString() || data.endTime
      });
    });

    // 各日のdailyUsageとの整合性をチェック
    const consistencyResults = [];

    for (const [date, sessions] of Object.entries(sessionsByDate)) {
      const dailyUsageId = `${userId}_${date}`;
      const dailyUsageDoc = await db.collection('dailyUsage').doc(dailyUsageId).get();

      const sessionTotal = sessions.reduce((sum, session) => sum + session.waterAmount, 0);
      const recordedAmount = dailyUsageDoc.exists ? (dailyUsageDoc.data()?.waterUsage || 0) : 0;
      const difference = Math.abs(sessionTotal - recordedAmount);

      consistencyResults.push({
        date: date,
        hasDailyUsageRecord: dailyUsageDoc.exists,
        sessionsCount: sessions.length,
        sessionTotal: Math.round(sessionTotal * 100) / 100,
        recordedAmount: Math.round(recordedAmount * 100) / 100,
        difference: Math.round(difference * 100) / 100,
        isConsistent: difference < 0.01,
        sessions: sessions
      });
    }

    // 全体統計
    const totalSessions = Object.values(sessionsByDate).flat().length;
    const consistentDays = consistencyResults.filter(day => day.isConsistent).length;
    const inconsistentDays = consistencyResults.filter(day => !day.isConsistent).length;

    return NextResponse.json({
      success: true,
      data: {
        userId: userId,
        period: {
          startDate: startDate,
          endDate: endDate
        },
        summary: {
          totalSessions: totalSessions,
          checkedDays: consistencyResults.length,
          consistentDays: consistentDays,
          inconsistentDays: inconsistentDays,
          consistencyRate: Math.round((consistentDays / consistencyResults.length) * 100)
        },
        details: consistencyResults
      }
    });

  } catch (error) {
    console.error('Daily usage consistency check error:', error);
    return NextResponse.json({
      success: false,
      error: 'dailyUsage整合性チェック中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

/**
 * dailyUsage修復API（管理者用）
 * PATCH /api/daily-usage-status
 *
 * 不整合なdailyUsageレコードを修復
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

    const { userId, date, waterUsage } = await request.json();

    if (!userId || !date || typeof waterUsage !== 'number') {
      return NextResponse.json({
        success: false,
        error: 'userId、date、waterUsageが必要です'
      }, { status: 400 });
    }

    const db = getDB();
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'データベースに接続できません'
      }, { status: 500 });
    }

    const dailyUsageId = `${userId}_${date}`;
    const dailyUsageRef = db.collection('dailyUsage').doc(dailyUsageId);
    const dailyUsageDoc = await dailyUsageRef.get();

    const oldWaterUsage = dailyUsageDoc.exists ? (dailyUsageDoc.data()?.waterUsage || 0) : 0;

    // dailyUsageレコード更新または作成
    const updateData = {
      userId: userId,
      date: date,
      waterUsage: waterUsage,
      lastUpdated: Timestamp.now(),
      repairedAt: Timestamp.now(),
      repairedBy: 'admin', // 実際の管理者IDを設定可能
      originalWaterUsage: oldWaterUsage
    };

    if (dailyUsageDoc.exists) {
      // 既存レコード更新
      await dailyUsageRef.update({
        waterUsage: waterUsage,
        lastUpdated: Timestamp.now(),
        repairedAt: Timestamp.now(),
        repairedBy: 'admin',
        originalWaterUsage: oldWaterUsage,
        updateCount: (dailyUsageDoc.data()?.updateCount || 0) + 1
      });
    } else {
      // 新規レコード作成
      await dailyUsageRef.set(updateData);
    }

    // 修復ログ記録
    await db.collection('admin_logs').add({
      action: 'repair_daily_usage',
      userId: userId,
      date: date,
      oldWaterUsage: oldWaterUsage,
      newWaterUsage: waterUsage,
      difference: waterUsage - oldWaterUsage,
      timestamp: Timestamp.now(),
      executedBy: 'admin'
    });

    return NextResponse.json({
      success: true,
      data: {
        userId: userId,
        date: date,
        oldWaterUsage: oldWaterUsage,
        newWaterUsage: waterUsage,
        difference: waterUsage - oldWaterUsage,
        message: 'dailyUsageレコードを修復しました'
      }
    });

  } catch (error) {
    console.error('Repair daily usage error:', error);
    return NextResponse.json({
      success: false,
      error: 'dailyUsage修復中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}