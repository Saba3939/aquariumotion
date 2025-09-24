import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, getDB } from '../../../lib/firebase-server';
import { Timestamp } from 'firebase-admin/firestore';

interface ReleaseFishResponse {
  success: boolean;
  data?: {
    releasedFish: {
      id: string;
      fish_name: string;
    };
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ReleaseFishResponse>> {
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

    // リクエストボディから魚のIDを取得
    const { fishId } = await request.json();
    
    if (!fishId) {
      return NextResponse.json(
        { success: false, error: '魚のIDが必要です' },
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
    
    // バッチ処理でデータを更新
    const batch = db.batch();

    // 魚を削除
    batch.delete(fishRef);

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
        releasedFish: {
          id: fishId,
          fish_name: fishData?.fish_name || '名無しの魚'
        }
      }
    });

  } catch (error) {
    console.error('Error in release-fish API:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}