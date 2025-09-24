import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-server';
import { getDB } from '@/lib/firebase-server';

interface SetFloorRequest {
  floor: number;
}

interface SetFloorResponse {
  success: boolean;
  error?: string;
  data?: {
    floor: number;
    updatedAt: string;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse<SetFloorResponse>> {
  try {
    console.log('=== set-floor API 開始 ===');

    // Authorization ヘッダーからトークンを取得
    const authHeader = request.headers.get('authorization');
    console.log('認証ヘッダー確認:', authHeader ? 'Bearer トークンあり' : 'ヘッダーなし');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('認証エラー: Bearer トークンが見つかりません');
      return NextResponse.json(
        { success: false, error: '認証トークンが必要です' },
        { status: 401 }
      );
    }

    const idToken = authHeader.substring(7); // "Bearer " を除去
    const decodedToken = await verifyIdToken(idToken);

    if (!decodedToken) {
      console.log('認証エラー: トークンの検証に失敗');
      return NextResponse.json(
        { success: false, error: '無効な認証トークンです' },
        { status: 401 }
      );
    }

    const userId = decodedToken.uid;
    console.log('認証成功 - ユーザーID:', userId);

    // リクエストボディを解析
    const body: SetFloorRequest = await request.json();
    const { floor } = body;

    // フロア値の検証
    if (typeof floor !== 'number' || !Number.isInteger(floor) || floor < 10 || floor > 99) {
      console.log('フロア値エラー:', floor);
      return NextResponse.json(
        { success: false, error: 'フロアは10-99の2桁の整数で指定してください（例：61=6号館1階）' },
        { status: 400 }
      );
    }

    // 号館と階数を計算
    const building = Math.floor(floor / 10);
    const floorNumber = floor % 10;

    // 基本的な範囲チェック
    if (building < 1 || building > 9 || floorNumber < 1 || floorNumber > 9) {
      console.log('フロア値範囲エラー:', { building, floorNumber });
      return NextResponse.json(
        { success: false, error: '無効なフロア値です（1-9号館、1-9階が有効）' },
        { status: 400 }
      );
    }

    console.log(`フロア設定: ${building}号館${floorNumber}階 (${floor})`);

    const db = getDB();
    if (!db) {
      console.log('データベース接続エラー');
      return NextResponse.json(
        { success: false, error: 'データベース接続エラー' },
        { status: 500 }
      );
    }

    // ユーザーデータを更新
    const userRef = db.collection('users').doc(userId);
    const updateData = {
      floor: floor,
      floorUpdatedAt: new Date()
    };

    await userRef.set(updateData, { merge: true });

    console.log('フロア情報更新完了:', updateData);

    return NextResponse.json({
      success: true,
      data: {
        floor: floor,
        updatedAt: updateData.floorUpdatedAt.toISOString()
      }
    });

  } catch (error) {
    console.error('Error in set-floor API:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// フロア情報を取得するGETエンドポイント
export async function GET(request: NextRequest): Promise<NextResponse<{ success: boolean; floor?: number; error?: string }>> {
  try {
    console.log('=== get-floor API 開始 ===');

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

    // ユーザーデータからフロア情報を取得
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'ユーザーデータが見つかりません' },
        { status: 404 }
      );
    }

    const userData = userDoc.data();
    const floor = userData?.floor || null;

    return NextResponse.json({
      success: true,
      floor: floor
    });

  } catch (error) {
    console.error('Error in get-floor API:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}