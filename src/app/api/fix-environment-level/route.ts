import { NextRequest, NextResponse } from 'next/server';
import { getDB, verifyIdToken } from '@/lib/firebase-server';
import { Timestamp } from 'firebase-admin/firestore';

interface FixEnvironmentLevelResponse {
  success: boolean;
  data?: {
    oldLevel: number;
    newLevel: number;
    updated: boolean;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<FixEnvironmentLevelResponse>> {
  try {
    console.log('=== fix-environment-level API 開始 ===');

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
    console.log('環境レベル修正 - ユーザーID:', userId);

    const db = getDB();
    if (!db) {
      return NextResponse.json(
        { success: false, error: 'データベース接続エラー' },
        { status: 500 }
      );
    }

    // 水族館データを取得
    const aquariumRef = db.collection('aquariums').doc(userId);
    const aquariumDoc = await aquariumRef.get();

    if (!aquariumDoc.exists) {
      return NextResponse.json(
        { success: false, error: '水族館データが存在しません' },
        { status: 404 }
      );
    }

    const currentData = aquariumDoc.data();
    const currentLevel = currentData?.enviromentLevel || 0;

    console.log('現在の環境レベル:', currentLevel);

    // 環境レベルが50未満の場合に50に修正
    if (currentLevel < 50) {
      await aquariumRef.update({
        enviromentLevel: 50,
        conservationMeter: Math.max(currentData?.conservationMeter || 0, 50), // 節約メーターも50未満なら50に
        lastUpdated: Timestamp.now()
      });

      console.log(`環境レベルを ${currentLevel} から 50 に修正しました`);

      return NextResponse.json({
        success: true,
        data: {
          oldLevel: currentLevel,
          newLevel: 50,
          updated: true
        }
      });
    } else {
      console.log('環境レベルは既に正常値です:', currentLevel);

      return NextResponse.json({
        success: true,
        data: {
          oldLevel: currentLevel,
          newLevel: currentLevel,
          updated: false
        }
      });
    }

  } catch (error) {
    console.error('Error in fix-environment-level API:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}