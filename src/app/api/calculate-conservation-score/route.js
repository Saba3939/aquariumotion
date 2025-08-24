// Firebase Admin SDK (ESモジュール対応)
import admin from 'firebase-admin';

// Firebase Admin初期化
function initializeFirebase() {
  try {
    if (!admin.apps.length) {
      const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT;
      
      if (!serviceAccountJson) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT environment variable is not set');
      }
      
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    return admin.firestore();
  } catch (error) {
    console.error('Firebase initialization error:', error);
    throw error;
  }
}

// 節約スコア計算ロジック
function calculateConservationScore(waterUsage, electricityUsage) {
  // 基準値設定（1日当たりの標準使用量）
  const WATER_BASELINE = 50.0;        // 50L/日
  const ELECTRICITY_BASELINE = 100.0; // 100kWh/日
  
  // 節約率計算（負の値も許可）
  const waterSavingRate = (WATER_BASELINE - waterUsage) / WATER_BASELINE;
  const electricitySavingRate = (ELECTRICITY_BASELINE - electricityUsage) / ELECTRICITY_BASELINE;
  
  // 重み付けスコア計算（水：50%、電気：50%）
  const waterScore = waterSavingRate * 50;
  const electricityScore = electricitySavingRate * 50;
  
  // 合計節約スコア（負の値〜100点）
  const totalScore = Math.round((waterScore + electricityScore) * 100) / 100;
  
  return {
    totalConservationScore: totalScore,
    breakdown: {
      waterScore: Math.round(waterScore * 100) / 100,
      electricityScore: Math.round(electricityScore * 100) / 100,
      waterSavingRate: Math.round(waterSavingRate * 1000) / 10, // パーセント表示
      electricitySavingRate: Math.round(electricitySavingRate * 1000) / 10,
      waterUsage,
      electricityUsage,
      waterBaseline: WATER_BASELINE,
      electricityBaseline: ELECTRICITY_BASELINE
    }
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    console.log('Conservation score calculation request:', { method: 'POST', body });
    
    // Firebase初期化
    const db = initializeFirebase();
    
    // APIキー認証
    const apiKey = request.headers.get('x-api-key');
    const secretKey = process.env.API_SECRET_KEY;

    if (!secretKey) {
      console.error('API_SECRET_KEY environment variable not set');
      return Response.json({ error: '内部サーバーエラー' }, { status: 500 });
    }

    if (!apiKey || apiKey !== secretKey) {
      return Response.json({ error: '認証に失敗しました' }, { status: 401 });
    }

    // リクエストボディの検証
    const { userId, date } = body;

    if (!userId || typeof userId !== 'string') {
      return Response.json({ error: 'userIdが必要です' }, { status: 400 });
    }

    // 日付の処理（指定されていない場合は今日）
    const targetDate = date || new Date().toISOString().split('T')[0];
    const docId = `${userId}_${targetDate}`;
    
    console.log('Processing conservation score for docId:', docId);

    // Firestoreトランザクションで節約スコア計算・更新
    const result = await db.runTransaction(async (transaction) => {
      const dailyUsageRef = db.collection('dailyUsage').doc(docId);
      const doc = await transaction.get(dailyUsageRef);
      
      if (!doc.exists) {
        throw new Error(`指定された日付（${targetDate}）の使用量データが見つかりません`);
      }

      const existingData = doc.data();
      console.log('Existing usage data:', existingData);
      
      // 節約スコア計算
      const scoreResult = calculateConservationScore(
        existingData.waterUsage || 0,
        existingData.electricityUsage || 0
      );
      
      console.log('Calculated conservation score:', scoreResult);
      
      // ドキュメント更新（節約スコア追加）
      const updateData = {
        totalConservationScore: scoreResult.totalConservationScore,
        conservationBreakdown: scoreResult.breakdown,
        scoreCalculatedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now()
      };

      transaction.update(dailyUsageRef, updateData);
      
      return {
        ...existingData,
        ...updateData
      };
    });

    console.log('Conservation score calculation completed successfully');

    // 成功レスポンス
    return Response.json({
      message: '節約スコアが正常に計算・更新されました',
      data: {
        userId,
        date: targetDate,
        totalConservationScore: result.totalConservationScore,
        conservationBreakdown: result.conservationBreakdown,
        updatedData: {
          userId: result.userId,
          date: result.date,
          waterUsage: result.waterUsage,
          electricityUsage: result.electricityUsage,
          totalConservationScore: result.totalConservationScore,
          scoreCalculatedAt: result.scoreCalculatedAt?.toDate?.() || result.scoreCalculatedAt,
          updatedAt: result.updatedAt?.toDate?.() || result.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('節約スコア計算API エラー:', error);
    
    if (error.message.includes('使用量データが見つかりません')) {
      return Response.json({ 
        error: error.message
      }, { status: 404 });
    }
    
    return Response.json({ 
      error: '内部サーバーエラー',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}