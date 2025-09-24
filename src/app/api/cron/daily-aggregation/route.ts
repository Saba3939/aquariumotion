// 多分使っていない
import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/firebase-server';
import { calculateConservationScore } from '@/lib/conservation-score';
import { createSuccessResponse, createErrorResponse } from '@/lib/validation';
import { Timestamp } from 'firebase-admin/firestore';

// Cron認証ヘルパー関数
function validateCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) {
    console.warn('CRON_SECRET not configured');
    return false;
  }
  
  return authHeader === `Bearer ${cronSecret}`;
}


export async function GET(request: NextRequest) {
  try {
    // Firebase Admin SDK初期化確認
    const db = getDB();
    if (!db) {
      console.error('Firebase Admin SDK not initialized');
      return NextResponse.json(
        createErrorResponse('SERVICE_UNAVAILABLE', 'Firebase service not available', 503),
        { status: 503 }
      );
    }

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
    
    // 昨日の全ユーザーのdailyUsageデータを取得（未処理のもの含む）
    const dailyUsageSnapshot = await db.collection('dailyUsage')
      .where('date', '==', dateString)
      .get();

    console.log(`Found ${dailyUsageSnapshot.docs.length} daily usage records for ${dateString}`);

    const results = {
      totalUsers: 0,
      scoredUsers: 0,
      fedFish: 0,
      newEggs: 0,
      environmentLevelChanges: 0,
      errors: [] as string[]
    };

    // バッチ処理でFirestore更新
    const batch = db.batch();
    let batchCount = 0;

    // ユーザーごとにグループ化して処理
    const userDataMap = new Map<string, { docs: FirebaseFirestore.QueryDocumentSnapshot[]; totalWater: number; totalElectricity: number }>();
    
    // データをユーザーごとに集計
    for (const doc of dailyUsageSnapshot.docs) {
      const dailyData = doc.data();
      const userId = dailyData.userId;
      
      if (!userDataMap.has(userId)) {
        userDataMap.set(userId, { docs: [], totalWater: 0, totalElectricity: 0 });
      }
      
      const userData = userDataMap.get(userId)!;
      userData.docs.push(doc);
      userData.totalWater += dailyData.waterUsage || 0;
      userData.totalElectricity += dailyData.electricityUsage || 0;
    }

    // ユーザーごとに総合スコアを算出・適用
    for (const [userId, userData] of userDataMap.entries()) {
      try {
        results.totalUsers++;

        // 水と電気使用量の合計で総合節約スコアを計算
        const conservationResult = calculateConservationScore({
          waterUsage: userData.totalWater,
          electricityUsage: userData.totalElectricity,
        });

        // そのユーザーの全dailyUsageドキュメントに同じスコアを設定
        for (const doc of userData.docs) {
          const existingData = doc.data();
          
          // すでに処理済みでないものだけ更新
          if (existingData.conservationScore === undefined || existingData.conservationScore === null) {
            batch.update(doc.ref, {
              conservationScore: conservationResult.conservationScore,
              totalDailyWater: userData.totalWater,
              totalDailyElectricity: userData.totalElectricity,
              updatedAt: Timestamp.now(),
            });
            batchCount++;
          }
        }

        results.scoredUsers++;

        // ユーザーの水族館データを取得・更新
        const aquariumRef = db.collection('aquariums').doc(userId);
        const aquariumDoc = await aquariumRef.get();

        if (aquariumDoc.exists) {
          const aquariumData = aquariumDoc.data()!;
          const currentConservationMeter = aquariumData.conservationMeter || 50;
          const currentEnvironmentLevel = aquariumData.enviromentLevel || 0;
          
          // 新しい節約メーターを計算
          let newConservationMeter = currentConservationMeter + conservationResult.conservationScore;
          let newEnvironmentLevel = currentEnvironmentLevel;
          let environmentChanged = false;
          
          // 自動餌やりロジック（conservationMeter ≥ 100で実行）
          let fedFishCount = 0;
          let newEggCount = 0;
          
          if (newConservationMeter >= 100) {
            // 魚のデータを取得
            const fishSnapshot = await aquariumRef.collection('fish').get();

            for (const fishDoc of fishSnapshot.docs) {
              const fishData = fishDoc.data();
              const currentEggMeter = fishData.eggMeter || 0;
              const newEggMeter = Math.min(3, currentEggMeter + 1); // 最大3

              // 魚のeggMeterを更新
              batch.update(fishDoc.ref, {
                eggMeter: newEggMeter,
                lastFed: Timestamp.now(),
              });
              batchCount++;

              fedFishCount++;

              // たまご生成ロジック（eggMeter = 3で実行）
              if (newEggMeter === 3 && currentEggMeter < 3) {
                newEggCount++;
              }
            }

            // 水族館データ更新（conservationMeterを100消費）
            batch.update(aquariumRef, {
              conservationMeter: Math.max(0, newConservationMeter - 100),
              enviromentLevel: newEnvironmentLevel,
              unhatchedEggCount: (aquariumData.unhatchedEggCount || 0) + newEggCount,
              lastFeedingDate: dateString,
              lastUpdated: Timestamp.now(),
            });
            batchCount++;

            results.fedFish += fedFishCount;
            results.newEggs += newEggCount;
          }
          
          // 環境レベル調整処理（餌やり後も含む）
          while (newConservationMeter <= 0 || newConservationMeter >= 100) {
            if (newConservationMeter <= 0) {
              // 環境レベルを-5し、メーターを50にリセット（0以下の部分は無視）
              newEnvironmentLevel = Math.max(0, newEnvironmentLevel - 5);
              newConservationMeter = 50;
              environmentChanged = true;
              results.environmentLevelChanges++;
            } else if (newConservationMeter >= 100) {
              // 環境レベルを+5し、残りの値を保持（50にリセットしない）
              newEnvironmentLevel = newEnvironmentLevel + 5;
              newConservationMeter = newConservationMeter - 100;
              environmentChanged = true;
              results.environmentLevelChanges++;
            }
            
            // 無限ループ防止
            if (results.environmentLevelChanges > 100) {
              console.warn('Too many environment level changes, breaking loop');
              break;
            }
          }

          // 餌やり条件を満たさない場合の水族館データ更新
          if (newConservationMeter < 100) {

            // 餌やり条件を満たさない場合はconservationMeterのみ更新
            const updateData: {
              conservationMeter: number;
              lastUpdated: Timestamp;
              enviromentLevel?: number;
            } = {
              conservationMeter: newConservationMeter,
              lastUpdated: Timestamp.now(),
            };
            
            if (environmentChanged) {
              updateData.enviromentLevel = newEnvironmentLevel;
            }
            
            batch.update(aquariumRef, updateData);
            batchCount++;
          }
        }

        // バッチサイズ制限（Firestoreは500件まで）
        if (batchCount >= 450) {
          await batch.commit();
          batchCount = 0;
          console.log(`Committed batch, processed ${results.totalUsers} users so far`);
        }

      } catch (userError) {
        console.error(`Error processing user ${userId}:`, userError);
        results.errors.push(`User ${userId}: ${userError}`);
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
        message: `${dateString}の${results.totalUsers}ユーザーのデータを一括処理しました`,
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
