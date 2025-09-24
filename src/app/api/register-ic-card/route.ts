import { NextRequest, NextResponse } from 'next/server';
import { getDB, verifyIdToken } from '@/lib/firebase-server';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * ICカード登録API
 * POST /api/register-ic-card
 *
 * ユーザーがICカードをシステムに登録する
 */
export async function POST(request: NextRequest) {
  try {
    // 認証確認（Firebase ID Token）
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({
        success: false,
        error: '認証が必要です'
      }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await verifyIdToken(idToken);

    if (!decodedToken) {
      return NextResponse.json({
        success: false,
        error: '無効な認証トークンです'
      }, { status: 401 });
    }

    const userId = decodedToken.uid;

    // リクエストボディ確認
    const { cardId, cardName = 'ICカード' } = await request.json();

    if (!cardId || typeof cardId !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'カードIDが必要です'
      }, { status: 400 });
    }

    const db = getDB();
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'データベースに接続できません'
      }, { status: 500 });
    }

    // 他のユーザーが同じカードIDを使用していないかチェック
    const usersWithSameCard = await db.collection('users')
      .where('icCardId', '==', cardId)
      .get();

    if (!usersWithSameCard.empty) {
      const existingUser = usersWithSameCard.docs[0];
      if (existingUser.id !== userId) {
        return NextResponse.json({
          success: false,
          error: 'このICカードは既に他のユーザーに登録されています'
        }, { status: 400 });
      } else {
        return NextResponse.json({
          success: false,
          error: 'このICカードは既にあなたのアカウントに登録されています'
        }, { status: 400 });
      }
    }

    // ユーザー情報にICカードIDを設定
    const currentTime = Timestamp.now();
    await db.collection('users').doc(userId).update({
      icCardId: cardId,
      icCardRegisteredAt: currentTime,
      icCardLastUsedAt: null
    });

    return NextResponse.json({
      success: true,
      data: {
        cardId: cardId,
        userId: userId,
        message: 'ICカードが正常に登録されました'
      }
    });

  } catch (error) {
    console.error('IC Card registration error:', error);
    return NextResponse.json({
      success: false,
      error: 'ICカード登録中にエラーが発生しました'
    }, { status: 500 });
  }
}

/**
 * ICカード情報取得API
 * GET /api/register-ic-card
 *
 * ユーザーの登録済みICカード情報を取得
 */
export async function GET(request: NextRequest) {
  try {
    // 認証確認（Firebase ID Token）
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({
        success: false,
        error: '認証が必要です'
      }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await verifyIdToken(idToken);

    if (!decodedToken) {
      return NextResponse.json({
        success: false,
        error: '無効な認証トークンです'
      }, { status: 401 });
    }

    const userId = decodedToken.uid;

    const db = getDB();
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'データベースに接続できません'
      }, { status: 500 });
    }

    // ユーザー情報からICカード情報を取得
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return NextResponse.json({
        success: false,
        error: 'ユーザー情報が見つかりません'
      }, { status: 404 });
    }

    const userData = userDoc.data()!;

    if (!userData.icCardId) {
      return NextResponse.json({
        success: true,
        data: {
          hasCard: false,
          message: 'ICカードが登録されていません'
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        hasCard: true,
        card: {
          cardId: userData.icCardId,
          isActive: true,
          registeredAt: userData.icCardRegisteredAt?.toDate?.()?.toISOString() || userData.icCardRegisteredAt,
          lastUsedAt: userData.icCardLastUsedAt?.toDate?.()?.toISOString() || userData.icCardLastUsedAt
        }
      }
    });

  } catch (error) {
    console.error('IC Card info retrieval error:', error);
    return NextResponse.json({
      success: false,
      error: 'ICカード情報取得中にエラーが発生しました'
    }, { status: 500 });
  }
}

/**
 * ICカード削除API
 * DELETE /api/register-ic-card
 *
 * ユーザーのICカード登録を削除
 */
export async function DELETE(request: NextRequest) {
  try {
    // 認証確認（Firebase ID Token）
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({
        success: false,
        error: '認証が必要です'
      }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await verifyIdToken(idToken);

    if (!decodedToken) {
      return NextResponse.json({
        success: false,
        error: '無効な認証トークンです'
      }, { status: 401 });
    }

    const userId = decodedToken.uid;

    const db = getDB();
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'データベースに接続できません'
      }, { status: 500 });
    }

    // ユーザー情報からICカードIDを取得
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return NextResponse.json({
        success: false,
        error: 'ユーザー情報が見つかりません'
      }, { status: 404 });
    }

    const userData = userDoc.data()!;

    if (!userData.icCardId) {
      return NextResponse.json({
        success: false,
        error: '削除するICカードが見つかりません'
      }, { status: 404 });
    }

    // アクティブなセッションがないかチェック
    const activeSessionsSnapshot = await db.collection('water_usage_sessions')
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .get();

    if (!activeSessionsSnapshot.empty) {
      return NextResponse.json({
        success: false,
        error: 'アクティブなセッションがあるため、ICカードを削除できません。使用を終了してから再試行してください'
      }, { status: 400 });
    }

    // ユーザー情報からICカード情報を削除
    await db.collection('users').doc(userId).update({
      icCardId: null,
      icCardRegisteredAt: null,
      icCardLastUsedAt: null,
      icCardDeletedAt: Timestamp.now()
    });

    return NextResponse.json({
      success: true,
      data: {
        message: 'ICカードの登録が削除されました'
      }
    });

  } catch (error) {
    console.error('IC Card deletion error:', error);
    return NextResponse.json({
      success: false,
      error: 'ICカード削除中にエラーが発生しました'
    }, { status: 500 });
  }
}