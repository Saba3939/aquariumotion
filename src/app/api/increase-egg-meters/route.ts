import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, getDB } from '../../../lib/firebase-server';
import { Timestamp } from 'firebase-admin/firestore';

interface IncreaseEggMetersResponse {
  success: boolean;
  data?: {
    updatedFishCount: number;
    updatedFish: Array<{
      id: string;
      fish_name: string;
      oldEggMeter: number;
      newEggMeter: number;
    }>;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<IncreaseEggMetersResponse>> {
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

    // 全ての魚の卵メーターを1増やす
    const batch = db.batch();
    const updatedFish = [];

    for (const fishDoc of fishSnapshot.docs) {
      const fishData = fishDoc.data();
      const currentEggMeter = fishData.eggMeter || 0;
      const newEggMeter = Math.min(currentEggMeter + 1, 3); // 最大3まで

      // 魚のeggMeterを1増加（最大3まで）
      batch.update(fishDoc.ref, {
        eggMeter: newEggMeter,
        lastEggMeterIncrease: Timestamp.now() // 増加時刻を記録
      });

      updatedFish.push({
        id: fishDoc.id,
        fish_name: fishData.fish_name,
        oldEggMeter: currentEggMeter,
        newEggMeter: newEggMeter
      });
    }

    // バッチ実行
    await batch.commit();

    console.log(`全ての魚の卵メーターを1増加しました。対象魚数: ${updatedFish.length}`);

    return NextResponse.json({
      success: true,
      data: {
        updatedFishCount: updatedFish.length,
        updatedFish: updatedFish
      }
    });

  } catch (error) {
    console.error('Error in increase-egg-meters API:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}