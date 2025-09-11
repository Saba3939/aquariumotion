import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, getDB } from '@/lib/firebase-server';
import * as admin from 'firebase-admin';
import { calculateConservationScore, getScoreLevel, getScoreMessage } from '@/lib/conservation-score';
import { createSuccessResponse, createErrorResponse } from '@/lib/validation';

/**
 * 節約スコアを水族館の節約メーターに加算するAPI
 * POST /api/add-conservation-score
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

    // リクエストボディを解析
    const body = await request.json();
    const { waterUsage, electricityUsage } = body;

    // 入力値の検証
    if (typeof waterUsage !== 'number' || typeof electricityUsage !== 'number') {
      return NextResponse.json(
        createErrorResponse('INVALID_INPUT', '使用量データは数値である必要があります', 400),
        { status: 400 }
      );
    }

    if (waterUsage < 0 || electricityUsage < 0) {
      return NextResponse.json(
        createErrorResponse('INVALID_INPUT', '使用量は0以上である必要があります', 400),
        { status: 400 }
      );
    }

    // 節約スコアを計算
    const conservationResult = calculateConservationScore({
      waterUsage,
      electricityUsage
    });

    // 現在の水族館データを取得
    const db = getDB();
    if (!db) {
      return NextResponse.json(
        createErrorResponse('DATABASE_ERROR', 'データベース接続エラー', 500),
        { status: 500 }
      );
    }

    const aquariumRef = db.collection('aquariums').doc(userId);
    const aquariumDoc = await aquariumRef.get();
    
    if (!aquariumDoc.exists) {
      return NextResponse.json(
        createErrorResponse('NOT_FOUND', '水族館データが見つかりません', 404),
        { status: 404 }
      );
    }

    const currentAquarium = aquariumDoc.data();
    const currentConservationMeter = currentAquarium?.conservationMeter || 0;
    const currentEnvironmentLevel = currentAquarium?.enviromentLevel || 0;

    // 節約メーターに加算
    let newConservationMeter = currentConservationMeter + conservationResult.conservationScore;
    
    // 節約メーターの上限・下限チェックと環境レベル処理
    let newEnvironmentLevel = currentEnvironmentLevel;
    let environmentChanged = false;
    let meterReset = false;
    let resetReason = '';
    
    if (newConservationMeter <= 0 && currentConservationMeter > 0) {
      // 節約メーターがゼロになった瞬間に環境レベルを-5し、メーターを50にリセット
      newEnvironmentLevel = Math.max(0, currentEnvironmentLevel - 5);
      newConservationMeter = 50;
      environmentChanged = true;
      meterReset = true;
      resetReason = 'zero';
    } else if (newConservationMeter >= 100 && currentConservationMeter < 100) {
      // 節約メーターが100になった瞬間に環境レベルを+5し、メーターを50にリセット
      newEnvironmentLevel = currentEnvironmentLevel + 5;
      newConservationMeter = 50;
      environmentChanged = true;
      meterReset = true;
      resetReason = 'hundred';
    } else {
      // 通常時はメーターを0-100の範囲に制限
      newConservationMeter = Math.max(0, Math.min(100, newConservationMeter));
    }

    // Firestoreを更新
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

    // レスポンスを返す
    interface ResponseData {
      message: string;
      conservationScore: number;
      previousMeter: number;
      newMeter: number;
      scoreLevel: string;
      scoreMessage: string;
      usageDetails: typeof conservationResult.details;
      reductionRates: {
        water: number;
        electricity: number;
      };
      environmentLevel?: {
        previous: number;
        new: number;
        change: number;
        message: string;
      };
      meterReset?: {
        resetTo: number;
        message: string;
      };
    }
    
    const responseData: ResponseData = {
      message: '節約スコアが水族館に反映されました',
      conservationScore: conservationResult.conservationScore,
      previousMeter: currentConservationMeter,
      newMeter: newConservationMeter,
      scoreLevel: getScoreLevel(conservationResult.conservationScore),
      scoreMessage: getScoreMessage(conservationResult.conservationScore),
      usageDetails: conservationResult.details,
      reductionRates: {
        water: conservationResult.waterReduction,
        electricity: conservationResult.electricityReduction,
      }
    };
    
    if (environmentChanged) {
      const change = newEnvironmentLevel - currentEnvironmentLevel;
      const message = change > 0 
        ? '節約メーターが100に達したため、環境レベルが向上しました！'
        : '節約メーターがゼロになったため、環境レベルが低下しました';
      
      responseData.environmentLevel = {
        previous: currentEnvironmentLevel,
        new: newEnvironmentLevel,
        change,
        message
      };
    }
    
    if (meterReset) {
      const message = resetReason === 'hundred'
        ? '素晴らしい節約です！メーターが50にリセットされました。引き続き頑張りましょう！🎉'
        : '節約メーターが50にリセットされました。再び節約に取り組みましょう！';
      
      responseData.meterReset = {
        resetTo: 50,
        message
      };
    }
    
    return NextResponse.json(
      createSuccessResponse(responseData),
      { status: 200 }
    );

  } catch (error) {
    console.error('Conservation score addition error:', error);
    return NextResponse.json(
      createErrorResponse('SERVER_ERROR', '節約スコアの追加中にエラーが発生しました', 500),
      { status: 500 }
    );
  }
}