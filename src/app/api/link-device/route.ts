import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-server';
import { linkDeviceToUser } from '../../../lib/firestore-utils';
import { 
  validateLinkDeviceRequest, 
  createErrorResponse, 
  createSuccessResponse 
} from '../../../lib/validation';

export async function POST(request: NextRequest) {
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

    // Content-Type確認
    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return NextResponse.json(
        createErrorResponse('INVALID_CONTENT_TYPE', 'Content-Type must be application/json', 400),
        { status: 400 }
      );
    }

    // リクエストボディ解析
    const body = await request.json();
    
    // データ検証
    const validationResult = validateLinkDeviceRequest(body);
    if (typeof validationResult === 'string') {
      return NextResponse.json(
        createErrorResponse('INVALID_INPUT', validationResult, 400),
        { status: 400 }
      );
    }

    // デバイス紐付け
    const success = await linkDeviceToUser(decodedToken.uid, validationResult.registrationCode);
    
    if (!success) {
      return NextResponse.json(
        createErrorResponse('DEVICE_NOT_FOUND', '無効な登録コードです', 404),
        { status: 404 }
      );
    }

    return NextResponse.json(
      createSuccessResponse({ message: 'Device linked successfully' })
    );

  } catch (error) {
    console.error('Error in link-device API:', error);
    return NextResponse.json(
      createErrorResponse('INTERNAL_ERROR', 'Internal server error', 500),
      { status: 500 }
    );
  }
}