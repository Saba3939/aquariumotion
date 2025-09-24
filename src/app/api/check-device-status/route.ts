import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '../../../lib/firebase-server';
import { 
  createErrorResponse, 
  createSuccessResponse 
} from '../../../lib/validation';

export async function POST(request: NextRequest) {
  try {
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
    const { deviceId } = body;
    
    if (!deviceId || typeof deviceId !== 'string') {
      return NextResponse.json(
        createErrorResponse('INVALID_INPUT', 'deviceId is required', 400),
        { status: 400 }
      );
    }

    // Firestoreからデバイス情報を取得
    const db = getDB();
    if (!db) {
      throw new Error('Firebase Admin SDK not initialized');
    }

    const deviceDoc = await db.collection('devices').doc(deviceId).get();
    
    if (!deviceDoc.exists) {
      return NextResponse.json(
        createErrorResponse('DEVICE_NOT_FOUND', 'Device not found', 404),
        { status: 404 }
      );
    }

    const deviceData = deviceDoc.data();
    
    return NextResponse.json(
      createSuccessResponse({
        deviceId: deviceData!.deviceId,
        isActive: deviceData!.isActive || false,
        userId: deviceData!.userId || null,
        deviceType: deviceData!.deviceType,
        lastSeen: deviceData!.lastSeen,
      })
    );

  } catch (error) {
    console.error('Error in check-device-status API:', error);
    return NextResponse.json(
      createErrorResponse('INTERNAL_ERROR', 'Internal server error', 500),
      { status: 500 }
    );
  }
}