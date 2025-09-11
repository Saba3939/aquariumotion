import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, getDB } from '@/lib/firebase-server';
import { calculateConservationScore } from '@/lib/conservation-score';
import { createSuccessResponse, createErrorResponse } from '@/lib/validation';
import * as admin from 'firebase-admin';

/**
 * ログイン時にdailyUsageデータを処理して節約スコアを自動加算するAPI
 * POST /api/process-daily-usage
 */
export async function POST(request: NextRequest) {
  try {
    // 認証確認 - IDトークンを取得
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        createErrorResponse('UNAUTHORIZED', '認証が必要です', 401),
        { status: 401 }
      );
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await verifyIdToken(idToken);
    if (!decodedToken) {
      return NextResponse.json(
        createErrorResponse('UNAUTHORIZED', '無効な認証トークンです', 401),
        { status: 401 }
      );
    }
    
    const userId = decodedToken.uid;

    const db = getDB();
    if (!db) {
      return NextResponse.json(
        createErrorResponse('DATABASE_ERROR', 'データベース接続エラー', 500),
        { status: 500 }
      );
    }

    // 現在の水族館データを取得
    const aquariumRef = db.collection('aquariums').doc(userId);
    const aquariumDoc = await aquariumRef.get();
    
    if (!aquariumDoc.exists) {
      // 水族館データがない場合は初回ログインとして作成
      const initialAquariumData = {
        enviromentLevel: 0,
        conservationMeter: 50, // 初期値50
        unhatchedEggCount: 0,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      };
      await aquariumRef.set(initialAquariumData);
    }

    // 未処理のdailyUsageデータを取得（インデックス不要なシンプルクエリ）
    const dailyUsageSnapshot = await db.collection('dailyUsage')
      .where('userId', '==', userId)
      .get();

    // conservationScoreが未設定のドキュメントのみをフィルタリングし、日付順にソート
    const unprocessedDocs = dailyUsageSnapshot.docs
      .filter(doc => {
        const data = doc.data();
        return data.conservationScore === undefined || data.conservationScore === null;
      })
      .sort((a, b) => {
        const dateA = a.data().date || '';
        const dateB = b.data().date || '';
        return dateA.localeCompare(dateB); // 日付文字列で昇順ソート（YYYY-MM-DD形式）
      });

    if (unprocessedDocs.length === 0) {
      // 処理するデータがない場合
      return NextResponse.json(
        createSuccessResponse({
          message: '処理対象のデータがありませんでした',
          processedCount: 0,
          totalScoreAdded: 0
        }),
        { status: 200 }
      );
    }

    let totalScoreAdded = 0;
    let processedCount = 0;
    const processedDates: string[] = [];

    // バッチ処理で各dailyUsageデータを処理
    const batch = db.batch();
    
    for (const doc of unprocessedDocs) {
      const dailyData = doc.data();
      const waterUsage = dailyData.waterUsage || 0;
      const electricityUsage = dailyData.electricityUsage || 0;

      // 節約スコアを計算
      const conservationResult = calculateConservationScore({
        waterUsage,
        electricityUsage
      });

      // dailyUsageドキュメントにスコアを保存
      batch.update(doc.ref, {
        conservationScore: conservationResult.conservationScore
      });

      totalScoreAdded += conservationResult.conservationScore;
      processedCount++;
      processedDates.push(dailyData.date);
    }

    // バッチ実行
    await batch.commit();

    // 水族館の節約メーターに累積スコアを加算
    const currentAquarium = aquariumDoc.exists ? aquariumDoc.data() : { conservationMeter: 50, enviromentLevel: 0 };
    const currentConservationMeter = currentAquarium?.conservationMeter || 50;
    const currentEnvironmentLevel = currentAquarium?.enviromentLevel || 0;

    // 新しい節約メーター値を計算
    let newConservationMeter = currentConservationMeter + totalScoreAdded;
    let newEnvironmentLevel = currentEnvironmentLevel;
    let environmentChanged = false;
    const meterResets: Array<{resetTo: number, reason: string, message: string}> = [];
    
    // メーターの上限・下限処理（複数回のリセットに対応）
    while (newConservationMeter <= 0 || newConservationMeter >= 100) {
      if (newConservationMeter <= 0) {
        // 環境レベルを-5し、メーターを50にリセット
        newEnvironmentLevel = Math.max(0, newEnvironmentLevel - 5);
        const deficit = Math.abs(newConservationMeter);
        newConservationMeter = Math.max(0, 50 - deficit);
        environmentChanged = true;
        meterResets.push({
          resetTo: newConservationMeter,
          reason: 'zero',
          message: '節約メーターがゼロを下回ったため、環境レベルが低下し、メーターがリセットされました'
        });
      } else if (newConservationMeter >= 100) {
        // 環境レベルを+5し、メーターを50にリセット
        newEnvironmentLevel = newEnvironmentLevel + 5;
        const surplus = newConservationMeter - 100;
        newConservationMeter = 50 + surplus;
        environmentChanged = true;
        meterResets.push({
          resetTo: newConservationMeter,
          reason: 'hundred',
          message: '節約メーターが100に達したため、環境レベルが向上し、メーターがリセットされました！'
        });
      }
      
      // 無限ループ防止
      if (meterResets.length > 10) {
        console.warn('Too many meter resets, breaking loop');
        break;
      }
    }

    // 最終的にメーターを0-100の範囲に制限
    newConservationMeter = Math.max(0, Math.min(100, newConservationMeter));

    // 水族館データを更新
    const updateData: {
      conservationMeter: number;
      lastUpdated: admin.firestore.FieldValue;
      enviromentLevel?: number;
    } = {
      conservationMeter: newConservationMeter,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    if (environmentChanged) {
      updateData.enviromentLevel = newEnvironmentLevel;
    }
    
    await aquariumRef.update(updateData);

    // レスポンスデータを構築
    const responseData = {
      message: 'dailyUsageデータの処理が完了しました',
      processedCount,
      processedDates,
      totalScoreAdded,
      previousMeter: currentConservationMeter,
      newMeter: newConservationMeter,
      environmentLevel: environmentChanged ? {
        previous: currentEnvironmentLevel,
        new: newEnvironmentLevel,
        change: newEnvironmentLevel - currentEnvironmentLevel,
        message: newEnvironmentLevel > currentEnvironmentLevel 
          ? '節約の成果により環境レベルが向上しました！' 
          : '節約が不足して環境レベルが低下しました'
      } : undefined,
      meterResets: meterResets.length > 0 ? meterResets : undefined
    };

    return NextResponse.json(
      createSuccessResponse(responseData),
      { status: 200 }
    );

  } catch (error) {
    console.error('Daily usage processing error:', error);
    return NextResponse.json(
      createErrorResponse('SERVER_ERROR', 'dailyUsage処理中にエラーが発生しました', 500),
      { status: 500 }
    );
  }
}