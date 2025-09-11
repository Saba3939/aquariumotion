import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, getDB } from '../../../lib/firebase-server';
import { Timestamp } from 'firebase-admin/firestore';

interface HatchEggResponse {
  success: boolean;
  data?: {
    newFish?: {
      id: string;
      type_id: number;
      fish_name: string;
      status: string;
      eggMeter: number;
      growthLevel: number;
      birthDate: Timestamp;
    };
    currentFishCount?: number;
    maxFishCount?: number;
    message?: string;
  };
  error?: string;
}

// 魚の名前候補リスト
const fishNames = [
  "まんぼう", "ふぐ"
];

// ランダムな魚のタイプIDを生成（fishNamesの範囲内）
function generateRandomFishTypeId(): number {
  return Math.floor(Math.random() * fishNames.length);
}

export async function POST(request: NextRequest): Promise<NextResponse<HatchEggResponse>> {
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
    const unhatchedEggCount = aquariumData?.unhatchedEggCount || 0;

    // たまごが存在するかチェック
    if (unhatchedEggCount <= 0) {
      return NextResponse.json(
        { success: false, error: '孵化できるたまごがありません' },
        { status: 400 }
      );
    }

    // 現在の魚の数をチェック
    const fishCollectionRef = db.collection('aquariums').doc(userId).collection('fish');
    const fishSnapshot = await fishCollectionRef.get();
    const currentFishCount = fishSnapshot.size;

    // 魚が3体以上いる場合は取捨選択が必要
    if (currentFishCount >= 3) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'FISH_LIMIT_EXCEEDED',
          data: { 
            currentFishCount,
            maxFishCount: 3,
            message: '魚の数が上限に達しています。新しい魚を孵化させるには、既存の魚を手放す必要があります。' 
          }
        },
        { status: 400 }
      );
    }

    // 新しい魚のデータを生成
    const newFishId = db.collection('aquariums').doc().id; // 新しいドキュメントIDを生成
    const typeId = generateRandomFishTypeId();
    const newFish = {
      id: newFishId,
      type_id: typeId,
      fish_name: fishNames[typeId], // type_idに対応する魚の名前を設定
      status: 'raising',
      eggMeter: 0,
      growthLevel: 1, // 新生魚なので成長レベル1から開始
      birthDate: Timestamp.now()
    };

    // バッチ処理でデータを更新
    const batch = db.batch();

    // 新しい魚をfishサブコレクションに追加
    const fishRef = aquariumRef.collection('fish').doc(newFishId);
    batch.set(fishRef, newFish);

    // unhatchedEggCountを1減らす
    batch.update(aquariumRef, {
      unhatchedEggCount: unhatchedEggCount - 1,
      lastUpdated: Timestamp.now()
    });

    // バッチ実行
    await batch.commit();

    return NextResponse.json({
      success: true,
      data: {
        newFish: newFish
      }
    });

  } catch (error) {
    console.error('Error in hatch-egg API:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
