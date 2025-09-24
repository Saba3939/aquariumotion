import { NextRequest, NextResponse } from 'next/server';
import { getDB, verifyIdToken } from '@/lib/firebase-server';
import { Timestamp } from 'firebase-admin/firestore';

interface InitUserResponse {
  success: boolean;
  data?: {
    aquariumCreated: boolean;
    initialFish?: {
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

// 魚の名前候補リスト（hatch-egg APIと同じもの）
const fishNames = [
  "まんぼう", "ふぐ", "マグロ", "タツノオトシゴ", "キイロハギ", "オレンジフィッシュ"
];

// ランダムな魚のタイプIDを生成
function generateRandomFishTypeId(): number {
  return Math.floor(Math.random() * fishNames.length);
}

export async function POST(request: NextRequest): Promise<NextResponse<InitUserResponse>> {
  try {
    console.log('=== init-user API 開始 ===');

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

    const db = getDB();

    if (!db) {
      console.log('データベース接続エラー');
      return NextResponse.json(
        { success: false, error: 'データベース接続エラー' },
        { status: 500 }
      );
    }

    // ユーザーの水族館データが既に存在するかチェック
    const aquariumRef = db.collection('aquariums').doc(userId);
    const aquariumDoc = await aquariumRef.get();

    console.log('水族館データ存在チェック:', aquariumDoc.exists ? '既存データあり' : 'データなし');

    if (aquariumDoc.exists) {
      const existingData = aquariumDoc.data();
      console.log('既存の水族館データ:', existingData);
      return NextResponse.json(
        { success: false, error: '水族館データは既に存在します' },
        { status: 400 }
      );
    }

    console.log('初期データ作成開始...');

    // 初期ユーザーデータを作成
    const initialUserData = {
      email: decodedToken.email,
      displayName: decodedToken.name || null,
      photoURL: decodedToken.picture || null,
      createdAt: Timestamp.now(),
      lastLoginAt: Timestamp.now(),
      icCardId: null,
      icCardRegisteredAt: null,
      icCardLastUsedAt: null
    };

    // 初期水族館データを作成
    const initialAquariumData = {
      enviromentLevel: 50,
      conservationMeter: 50,
      unhatchedEggCount: 0,
      lastUpdated: Timestamp.now()
    };

    // ランダムな初期魚を生成
    const typeId = generateRandomFishTypeId();
    const initialFishId = db.collection('aquariums').doc().id; // 新しいドキュメントIDを生成
    const initialFish = {
      id: initialFishId,
      type_id: typeId,
      fish_name: fishNames[typeId],
      status: 'raising',
      eggMeter: 0,
      growthLevel: 1,
      birthDate: Timestamp.now()
    };

    console.log('作成する初期ユーザーデータ:', initialUserData);
    console.log('作成する初期水族館データ:', initialAquariumData);
    console.log('作成する初期魚データ:', initialFish);

    // トランザクションを使用してアトミックな書き込みを保証
    const result = await db.runTransaction(async (transaction) => {
      // 再度存在チェック（競合状態を防ぐ）
      const aquariumDocInTransaction = await transaction.get(aquariumRef);

      if (aquariumDocInTransaction.exists) {
        throw new Error('AQUARIUM_ALREADY_EXISTS');
      }

      // ユーザーデータも存在チェック
      const userRef = db.collection('users').doc(userId);
      const userDocInTransaction = await transaction.get(userRef);

      // ユーザーデータを作成（存在しない場合のみ）
      if (!userDocInTransaction.exists) {
        transaction.set(userRef, initialUserData);
        console.log('ユーザーデータを作成');
      } else {
        console.log('ユーザーデータは既に存在するためスキップ');
      }

      // 水族館データを作成
      transaction.set(aquariumRef, initialAquariumData);

      // 初期魚をfish サブコレクションに追加
      const fishRef = aquariumRef.collection('fish').doc(initialFishId);
      transaction.set(fishRef, initialFish);

      console.log('トランザクション内でデータ作成完了');
      return {
        userData: initialUserData,
        aquariumData: initialAquariumData,
        fishData: initialFish
      };
    });

    console.log('トランザクション成功:', result);

    console.log(`新規ユーザー ${userId} の初期データを作成しました:`, {
      user: initialUserData,
      aquarium: initialAquariumData,
      fish: initialFish
    });

    return NextResponse.json({
      success: true,
      data: {
        aquariumCreated: true,
        initialFish: initialFish
      }
    });

  } catch (error) {
    console.error('Error in init-user API:', error);

    // 水族館が既に存在する場合のエラー
    if (error instanceof Error && error.message === 'AQUARIUM_ALREADY_EXISTS') {
      console.log('競合検出: 水族館データが既に存在します');
      return NextResponse.json(
        { success: false, error: '水族館データは既に存在します' },
        { status: 400 }
      );
    }

    // その他のエラー
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
