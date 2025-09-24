import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-server';
import { getUserDevices } from '../../../lib/firestore-utils';
import { 
  createErrorResponse, 
  createSuccessResponse 
} from '../../../lib/validation';

export async function GET(request: NextRequest) {
  try {
    // Firebase認証確認
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        createErrorResponse('UNAUTHORIZED', 'Authorization header required', 401),
        { status: 401 }
      );
    }

    const idToken = authHeader.slice(7);
    const decodedToken = await verifyIdToken(idToken);
    if (!decodedToken) {
      return NextResponse.json(
        createErrorResponse('UNAUTHORIZED', 'Invalid ID token', 401),
        { status: 401 }
      );
    }

    // ユーザーデバイス情報取得
    const userDevices = await getUserDevices(decodedToken.uid);

    return NextResponse.json(
      createSuccessResponse(userDevices || {})
    );

  } catch (error) {
    console.error('Error in user-devices API:', error);
    return NextResponse.json(
      createErrorResponse('INTERNAL_ERROR', 'Internal server error', 500),
      { status: 500 }
    );
  }
}