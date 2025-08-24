import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-server';
import { calculateConservationScore } from '@/lib/conservation-score';
import { createSuccessResponse, createErrorResponse } from '@/lib/validation';
import { Timestamp } from 'firebase-admin/firestore';

// Vercel Cron Job専用認証
function validateCronRequest(request: NextRequest): boolean {
  // Vercel Cronからのリクエストかチェック
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) {
    console.error('CRON_SECRET environment variable not set');
    return false;
  }
  
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * 日次集計・ゲームロジック更新API
 * 毎日深夜0時(JST)にVercel Cron Jobで実行
 */
export async function GET(request: NextRequest) {
  try {
    // Cron認証チェック
    if (!validateCronRequest(request)) {
      return NextResponse.json(
        createErrorResponse('UNAUTHORIZED', 'Cron authentication failed', 401),
        { status: 401 }
      );
    }

    console.log('Starting daily aggregation...', new Date().toISOString());

    // 昨日の日付文字列を生成
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateString = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // 全ユーザーの昨日のdailyUsageデータを取得
    const dailyUsageSnapshot = await db.collection('dailyUsage')
      .where('date', '==', dateString)
      .get();

    const processedUsers: string[] = [];
    const results = {
      totalUsers: 0,
      scoredUsers: 0,
      fedFish: 0,
      newEggs: 0,
      errors: [] as string[]
    };

    // バッチ処理でFirestore更新
    const batch = db.batch();
    let batchCount = 0;

    for (const doc of dailyUsageSnapshot.docs) {
      try {
        const dailyData = doc.data();
        const userId = dailyData.userId;

        if (processedUsers.includes(userId)) continue;
        processedUsers.push(userId);
        results.totalUsers++;

        // 節約スコア計算
        const conservationResult = calculateConservationScore({
          waterUsage: dailyData.waterUsage || 0,
          electricityUsage: dailyData.electricityUsage || 0,
        });

        // dailyUsageにスコアを更新
        batch.update(doc.ref, {
          conservationScore: conservationResult.conservationScore,
          updatedAt: Timestamp.now(),
        });

        results.scoredUsers++;

        // ユーザーの水族館データを取得
        const aquariumRef = db.collection('aquariums').doc(userId);
        const aquariumDoc = await aquariumRef.get();

        if (aquariumDoc.exists) {
          const aquariumData = aquariumDoc.data()!;
          const currentConservationMeter = aquariumData.conservationMeter || 0;
          const newConservationMeter = currentConservationMeter + conservationResult.conservationScore;

          // 自動餌やりロジック（conservationMeter ≥ 100で実行）
          if (newConservationMeter >= 100) {
            // 魚のデータを取得
            const fishSnapshot = await aquariumRef.collection('fish').get();
            let fedFishCount = 0;
            let newEggCount = 0;

            for (const fishDoc of fishSnapshot.docs) {
              const fishData = fishDoc.data();
              const currentEggMeter = fishData.eggMeter || 0;
              const newEggMeter = Math.min(3, currentEggMeter + 1); // 最大3

              // 魚のeggMeterを更新
              batch.update(fishDoc.ref, {
                eggMeter: newEggMeter,
                lastFed: Timestamp.now(),
              });

              fedFishCount++;

              // たまご生成ロジック（eggMeter = 3で実行）
              if (newEggMeter === 3 && currentEggMeter < 3) {
                newEggCount++;
              }
            }

            // 水族館データ更新（conservationMeterを100消費）
            batch.update(aquariumRef, {
              conservationMeter: Math.max(0, newConservationMeter - 100),
              unhatchedEggCount: (aquariumData.unhatchedEggCount || 0) + newEggCount,
              lastFeedingDate: dateString,
              lastUpdated: Timestamp.now(),
            });

            results.fedFish += fedFishCount;
            results.newEggs += newEggCount;
          } else {
            // 餌やり条件を満たさない場合はconservationMeterのみ更新
            batch.update(aquariumRef, {
              conservationMeter: newConservationMeter,
              lastUpdated: Timestamp.now(),
            });
          }
        }

        batchCount++;
        
        // バッチサイズ制限（Firestoreは500件まで）
        if (batchCount >= 450) {
          await batch.commit();
          batchCount = 0;
        }

      } catch (userError) {
        const userData = doc.data();
        console.error(`Error processing user ${userData.userId}:`, userError);
        results.errors.push(`User ${userData.userId}: ${userError}`);
      }
    }

    // 残りのバッチを実行
    if (batchCount > 0) {
      await batch.commit();
    }

    console.log('Daily aggregation completed:', results);

    return NextResponse.json(
      createSuccessResponse({
        processedDate: dateString,
        results,
        timestamp: new Date().toISOString(),
      })
    );

  } catch (error) {
    console.error('Daily aggregation failed:', error);
    return NextResponse.json(
      createErrorResponse('INTERNAL_ERROR', 'Daily aggregation failed', 500),
      { status: 500 }
    );
  }
}

// POST メソッドは許可しない
export async function POST() {
  return NextResponse.json(
    createErrorResponse('METHOD_NOT_ALLOWED', 'Only GET method is allowed', 405),
    { status: 405 }
  );
}