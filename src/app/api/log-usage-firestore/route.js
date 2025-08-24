// Firebase Admin SDK (ESモジュール対応)
import admin from 'firebase-admin';

// Firebase Admin初期化
function initializeFirebase() {
  try {
    if (!admin.apps.length) {
      const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT;
      console.log('Service account exists:', !!serviceAccountJson);
      
      if (!serviceAccountJson) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT environment variable is not set');
      }
      
      const serviceAccount = JSON.parse(serviceAccountJson);
      console.log('Initializing Firebase for project:', serviceAccount.project_id);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('Firebase Admin initialized successfully');
    }
    return admin.firestore();
  } catch (error) {
    console.error('Firebase initialization error:', error);
    throw error;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    console.log('Request received:', { method: 'POST', body });
    
    // Firebase初期化
    const db = initializeFirebase();
    
    // APIキー認証
    const apiKey = request.headers.get('x-api-key');
    const secretKey = process.env.API_SECRET_KEY;
    
    console.log('API Key check:', { apiKey: !!apiKey, secretKey: !!secretKey });

    if (!secretKey) {
      console.error('API_SECRET_KEY environment variable not set');
      return Response.json({ error: '内部サーバーエラー' }, { status: 500 });
    }

    if (!apiKey || apiKey !== secretKey) {
      return Response.json({ error: '認証に失敗しました' }, { status: 401 });
    }

    // リクエストボディの検証
    const { userId, usageType, amount } = body;

    if (!userId || typeof userId !== 'string') {
      return Response.json({ error: 'userIdが必要です' }, { status: 400 });
    }

    if (!usageType || !['water', 'electricity'].includes(usageType)) {
      return Response.json({ error: 'usageTypeはwaterまたはelectricityである必要があります' }, { status: 400 });
    }

    if (typeof amount !== 'number' || amount < 0) {
      return Response.json({ error: 'amountは正の数値である必要があります' }, { status: 400 });
    }

    // 今日の日付を取得 (YYYY-MM-DD形式)
    const today = new Date().toISOString().split('T')[0];
    const docId = `${userId}_${today}`;
    
    console.log('Processing docId:', docId);

    // Firestoreトランザクションで累積データを更新
    const result = await db.runTransaction(async (transaction) => {
      const dailyUsageRef = db.collection('dailyUsage').doc(docId);
      const doc = await transaction.get(dailyUsageRef);
      
      const now = admin.firestore.Timestamp.now();

      if (doc.exists) {
        // 既存データがある場合は加算更新
        const existingData = doc.data();
        console.log('Existing data found:', existingData);
        
        const updateData = {
          updatedAt: now
        };

        if (usageType === 'water') {
          updateData.waterUsage = existingData.waterUsage + amount;
          console.log(`Water usage: ${existingData.waterUsage} + ${amount} = ${updateData.waterUsage}`);
        } else if (usageType === 'electricity') {
          updateData.electricityUsage = existingData.electricityUsage + amount;
          console.log(`Electricity usage: ${existingData.electricityUsage} + ${amount} = ${updateData.electricityUsage}`);
        }

        transaction.update(dailyUsageRef, updateData);
        
        return {
          ...existingData,
          ...updateData,
          isNew: false
        };
      } else {
        // 新規ドキュメント作成
        console.log('Creating new document');
        const newData = {
          userId,
          date: today,
          waterUsage: usageType === 'water' ? amount : 0,
          electricityUsage: usageType === 'electricity' ? amount : 0,
          createdAt: now,
          updatedAt: now
        };

        transaction.set(dailyUsageRef, newData);
        
        return {
          ...newData,
          isNew: true
        };
      }
    });

    console.log('Transaction completed successfully');

    // 成功レスポンス
    return Response.json({
      message: '使用量が正常に記録されました',
      data: {
        userId,
        usageType,
        amount,
        date: today,
        storedData: {
          userId: result.userId,
          date: result.date,
          waterUsage: result.waterUsage,
          electricityUsage: result.electricityUsage,
          createdAt: result.createdAt?.toDate?.() || result.createdAt,
          updatedAt: result.updatedAt?.toDate?.() || result.updatedAt,
          isNew: result.isNew
        }
      }
    });

  } catch (error) {
    console.error('使用量記録API エラー:', error);
    return Response.json({ 
      error: '内部サーバーエラー',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}