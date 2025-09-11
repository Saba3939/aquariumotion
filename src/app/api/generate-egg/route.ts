import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, getDB } from '../../../lib/firebase-server';
import { Timestamp } from 'firebase-admin/firestore';

interface GenerateEggResponse {
  success: boolean;
  data?: {
    generatedEggs: number;
    updatedFish: Array<{
      id: string;
      fish_name: string;
      oldEggMeter: number;
    }>;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<GenerateEggResponse>> {
  try {
    // Authorization ヘッダーからトークンを取得
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: '認証トークンが必要です' },
        { status: 401 }
      );
    }

    const idToken = authHeader.substring(7); // "Bearer " を除去
    const decodedToken = await verifyIdToken(idToken);
    
    if (!decodedToken) {
      return NextResponse.json(
        { success: false, error: '無効な認証トークンです' },
        { status: 401 }
      );
    }

    const userId = decodedToken.uid;
    const db = getDB();
    
    if (!db) {
      return NextResponse.json(
        { success: false, error: 'データベース接続エラー' },
        { status: 500 }
      );
    }

    // ユーザーの魚データを取得
    const fishCollectionRef = db.collection('aquariums').doc(userId).collection('fish');
    const fishSnapshot = await fishCollectionRef.get();

    if (fishSnapshot.empty) {
      return NextResponse.json(
        { success: false, error: '魚が見つかりません' },
        { status: 404 }
      );
    }

    // eggMeterが3の魚を見つけて処理
    const batch = db.batch();
    const updatedFish = [];
    let totalEggsGenerated = 0;

    for (const fishDoc of fishSnapshot.docs) {
      const fishData = fishDoc.data();
      
      if (fishData.eggMeter >= 3) {
        // eggMeterが3以上の魚は卵を生成してeggMeterをリセット
        const eggsFromThisFish = Math.floor(fishData.eggMeter / 3);
        totalEggsGenerated += eggsFromThisFish;
        
        const newEggMeter = fishData.eggMeter % 3; // 余りは残す
        
        // 魚のeggMeterをリセット
        batch.update(fishDoc.ref, {
          eggMeter: newEggMeter,
          lastEggGeneration: Timestamp.now()
        });

        updatedFish.push({
          id: fishDoc.id,
          fish_name: fishData.fish_name,
          oldEggMeter: fishData.eggMeter
        });
      }
    }

    if (totalEggsGenerated === 0) {
      return NextResponse.json(
        { success: false, error: '卵を生成できる魚がいません（eggMeter < 3）' },
        { status: 400 }
      );
    }

    // 水族館データを更新（unhatchedEggCountを増加）
    const aquariumRef = db.collection('aquariums').doc(userId);
    const aquariumDoc = await aquariumRef.get();
    
    if (!aquariumDoc.exists) {
      return NextResponse.json(
        { success: false, error: '水族館が見つかりません' },
        { status: 404 }
      );
    }

    const currentEggCount = aquariumDoc.data()?.unhatchedEggCount || 0;
    batch.update(aquariumRef, {
      unhatchedEggCount: currentEggCount + totalEggsGenerated,
      lastUpdated: Timestamp.now()
    });

    // バッチ実行
    await batch.commit();

    return NextResponse.json({
      success: true,
      data: {
        generatedEggs: totalEggsGenerated,
        updatedFish: updatedFish
      }
    });

  } catch (error) {
    console.error('Error in generate-egg API:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}