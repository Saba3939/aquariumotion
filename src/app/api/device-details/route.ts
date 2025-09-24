import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-server';
import { getDeviceDetails } from '../../../lib/firestore-utils';
import { 
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
    const { deviceIds } = body;
    
    if (!Array.isArray(deviceIds)) {
      return NextResponse.json(
        createErrorResponse('INVALID_INPUT', 'deviceIds must be an array', 400),
        { status: 400 }
      );
    }

    // デバイス詳細取得
    const devices = await getDeviceDetails(deviceIds, decodedToken.uid);

    return NextResponse.json(
      createSuccessResponse(devices)
    );

  } catch (error) {
    console.error('Error in device-details API:', error);
    return NextResponse.json(
      createErrorResponse('INTERNAL_ERROR', 'Internal server error', 500),
      { status: 500 }
    );
  }
}