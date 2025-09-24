import { NextRequest, NextResponse } from 'next/server';
import { getDB, verifyIdToken } from '@/lib/firebase-server';
import { Timestamp } from 'firebase-admin/firestore';

interface CreateInitialFishResponse {
  success: boolean;
  data?: {
    fish: {
      id: string;
      type_id: number;
      fish_name: string;
      status: string;
      eggMeter: number;
      growthLevel: number;
      birthDate: Timestamp;
    };
  };
  error?: string;
}

// 魚の名前候補リスト
const fishNames = [
  "まんぼう", "ふぐ", "マグロ", "タツノオトシゴ", "キイロハギ", "オレンジフィッシュ"
];

// ランダムな魚のタイプIDを生成
function generateRandomFishTypeId(): number {
  return Math.floor(Math.random() * fishNames.length);
}

export async function POST(request: NextRequest): Promise<NextResponse<CreateInitialFishResponse>> {
  try {
    console.log('=== create-initial-fish API 開始 ===');

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
    console.log('既存ユーザー用初期魚作成 - ユーザーID:', userId);

    const db = getDB();
    if (!db) {
      return NextResponse.json(
        { success: false, error: 'データベース接続エラー' },
        { status: 500 }
      );
    }

    // 水族館データが存在するかチェック
    const aquariumRef = db.collection('aquariums').doc(userId);
    const aquariumDoc = await aquariumRef.get();

    if (!aquariumDoc.exists) {
      return NextResponse.json(
        { success: false, error: '水族館データが存在しません' },
        { status: 404 }
      );
    }

    // 既存の魚をチェック
    const fishCollection = aquariumRef.collection('fish');
    const existingFish = await fishCollection.get();

    if (!existingFish.empty) {
      return NextResponse.json(
        { success: false, error: '魚は既に存在します' },
        { status: 400 }
      );
    }

    // 初期魚を作成
    const typeId = generateRandomFishTypeId();
    const fishId = db.collection('aquariums').doc().id;
    const initialFish = {
      id: fishId,
      type_id: typeId,
      fish_name: fishNames[typeId],
      status: 'raising',
      eggMeter: 0,
      growthLevel: 1,
      birthDate: Timestamp.now()
    };

    // 魚を追加
    await fishCollection.doc(fishId).set(initialFish);

    console.log('既存ユーザー用初期魚を作成しました:', initialFish);

    return NextResponse.json({
      success: true,
      data: {
        fish: initialFish
      }
    });

  } catch (error) {
    console.error('Error in create-initial-fish API:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}