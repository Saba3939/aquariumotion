import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, getDB } from '../../../lib/firebase-server';
import { Timestamp } from 'firebase-admin/firestore';

interface ResetFishStatusResponse {
  success: boolean;
  data?: {
    updatedFishCount: number;
    resetFish: Array<{
      id: string;
      fish_name: string;
      oldStatus: string;
      newStatus: string;
    }>;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ResetFishStatusResponse>> {
  try {
    // Authorization ヘッダーからトークンを取得
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: '認証トークンが必要です' },
        { status: 401 }
      );
    }

    const idToken = authHeader.substring(7);
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

    // 全ての魚のデータを取得
    const fishCollectionRef = db.collection('aquariums').doc(userId).collection('fish');
    const fishSnapshot = await fishCollectionRef.get();

    if (fishSnapshot.empty) {
      return NextResponse.json(
        { success: false, error: '魚が見つかりません' },
        { status: 404 }
      );
    }

    // バッチ処理でデータを更新
    const batch = db.batch();
    const resetFish: Array<{
      id: string;
      fish_name: string;
      oldStatus: string;
      newStatus: string;
    }> = [];

    fishSnapshot.docs.forEach((fishDoc) => {
      const fishData = fishDoc.data();
      const oldStatus = fishData?.status || 'unknown';

      // inLinkAquarium以外の魚のみraisingに変更
      if (oldStatus !== 'inLinkAquarium') {
        batch.update(fishDoc.ref, {
          status: 'raising',
          lastUpdated: Timestamp.now()
        });

        resetFish.push({
          id: fishDoc.id,
          fish_name: fishData?.fish_name || '名無しの魚',
          oldStatus: oldStatus,
          newStatus: 'raising'
        });
      }
    });

    // 水族館の最終更新日を更新
    const aquariumRef = db.collection('aquariums').doc(userId);
    batch.update(aquariumRef, {
      lastUpdated: Timestamp.now()
    });

    // バッチ実行
    await batch.commit();

    return NextResponse.json({
      success: true,
      data: {
        updatedFishCount: resetFish.length,
        resetFish: resetFish
      }
    });

  } catch (error) {
    console.error('Error in reset-fish-status API:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}