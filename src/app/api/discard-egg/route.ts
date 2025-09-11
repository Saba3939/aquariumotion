import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, getDB } from '../../../lib/firebase-server';
import { Timestamp } from 'firebase-admin/firestore';

interface DiscardEggResponse {
  success: boolean;
  data?: {
    discardedEggCount: number;
    remainingEggCount: number;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<DiscardEggResponse>> {
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

    // リクエストボディから放棄する卵の数を取得（デフォルトは1個）
    const { eggCount = 1 } = await request.json();
    
    if (eggCount < 1) {
      return NextResponse.json(
        { success: false, error: '放棄する卵の数は1個以上である必要があります' },
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

    // ユーザーの水族館データを取得
    const aquariumRef = db.collection('aquariums').doc(userId);
    const aquariumDoc = await aquariumRef.get();

    if (!aquariumDoc.exists) {
      return NextResponse.json(
        { success: false, error: '水族館が見つかりません' },
        { status: 404 }
      );
    }

    const aquariumData = aquariumDoc.data();
    const currentEggCount = aquariumData?.unhatchedEggCount || 0;

    // 放棄する卵があるかチェック
    if (currentEggCount <= 0) {
      return NextResponse.json(
        { success: false, error: '放棄できる卵がありません' },
        { status: 400 }
      );
    }

    // 実際に放棄する卵の数を計算（現在の卵数を超えないように）
    const actualDiscardCount = Math.min(eggCount, currentEggCount);
    const remainingEggCount = currentEggCount - actualDiscardCount;

    // 水族館データを更新
    await aquariumRef.update({
      unhatchedEggCount: remainingEggCount,
      lastUpdated: Timestamp.now()
    });

    return NextResponse.json({
      success: true,
      data: {
        discardedEggCount: actualDiscardCount,
        remainingEggCount: remainingEggCount
      }
    });

  } catch (error) {
    console.error('Error in discard-egg API:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}