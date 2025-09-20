import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, getDB } from '../../../lib/firebase-server';
import { Timestamp } from 'firebase-admin/firestore';

interface UpdateFishStatusResponse {
  success: boolean;
  data?: {
    updatedFish: {
      id: string;
      fish_name: string;
      oldStatus: string;
      newStatus: string;
    };
    resetToRaisingFish?: Array<{
      id: string;
      fish_name: string;
    }>;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<UpdateFishStatusResponse>> {
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

    // リクエストボディから魚のIDと新しいステータスを取得
    const { fishId, newStatus } = await request.json();

    if (!fishId || !newStatus) {
      return NextResponse.json(
        { success: false, error: '魚のIDと新しいステータスが必要です' },
        { status: 400 }
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

    // 魚のデータを取得
    const fishRef = db.collection('aquariums').doc(userId).collection('fish').doc(fishId);
    const fishDoc = await fishRef.get();

    if (!fishDoc.exists) {
      return NextResponse.json(
        { success: false, error: '指定された魚が見つかりません' },
        { status: 404 }
      );
    }

    const fishData = fishDoc.data();
    const oldStatus = fishData?.status;

    // バッチ処理でデータを更新
    const batch = db.batch();
    const resetToRaisingFish: Array<{ id: string; fish_name: string }> = [];

    // 新しいステータスがinLinkAquariumの場合、既存のinLinkAquarium魚をraisingに戻す
    if (newStatus === 'inLinkAquarium') {
      const fishCollectionRef = db.collection('aquariums').doc(userId).collection('fish');
      const existingInLinkFishSnapshot = await fishCollectionRef.where('status', '==', 'inLinkAquarium').get();

      // 既存のinLinkAquarium魚をraisingに戻す
      existingInLinkFishSnapshot.docs.forEach((doc) => {
        if (doc.id !== fishId) { // 現在更新しようとしている魚以外
          const docData = doc.data();
          batch.update(doc.ref, {
            status: 'raising',
            lastUpdated: Timestamp.now()
          });

          resetToRaisingFish.push({
            id: doc.id,
            fish_name: docData?.fish_name || '名無しの魚'
          });
        }
      });
    }

    // 指定された魚のステータスを更新
    batch.update(fishRef, {
      status: newStatus,
      lastUpdated: Timestamp.now()
    });

    // 水族館の最終更新日を更新
    const aquariumRef = db.collection('aquariums').doc(userId);
    batch.update(aquariumRef, {
      lastUpdated: Timestamp.now()
    });

    // バッチ実行
    await batch.commit();

    const responseData: {
      updatedFish: {
        id: string;
        fish_name: string;
        oldStatus: string;
        newStatus: string;
      };
      resetToRaisingFish?: Array<{
        id: string;
        fish_name: string;
      }>;
    } = {
      updatedFish: {
        id: fishId,
        fish_name: fishData?.fish_name || '名無しの魚',
        oldStatus: oldStatus || 'unknown',
        newStatus: newStatus
      }
    };

    // リセットされた魚がいる場合は情報を含める
    if (resetToRaisingFish.length > 0) {
      responseData.resetToRaisingFish = resetToRaisingFish;
    }

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Error in update-fish-status API:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}