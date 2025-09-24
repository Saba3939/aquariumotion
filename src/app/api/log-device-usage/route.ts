import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey, getDB } from '../../../lib/firebase-server';
import { saveDailyUsage, verifyDevice } from '../../../lib/firestore-utils';
import { 
  createErrorResponse, 
  createSuccessResponse 
} from '../../../lib/validation';
import { Timestamp } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    // API-KEY認証
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || !verifyApiKey(apiKey)) {
      return NextResponse.json(
        createErrorResponse('UNAUTHORIZED', 'Invalid API key', 401),
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
    const { deviceId, usageType, amount } = body;
    
    // 基本的なデータ検証
    if (!deviceId || typeof deviceId !== 'string') {
      return NextResponse.json(
        createErrorResponse('INVALID_INPUT', 'deviceId is required and must be a string', 400),
        { status: 400 }
      );
    }
    
    if (!usageType || !['water', 'electricity'].includes(usageType)) {
      return NextResponse.json(
        createErrorResponse('INVALID_INPUT', 'usageType must be "water" or "electricity"', 400),
        { status: 400 }
      );
    }
    
    if (typeof amount !== 'number' || amount < 0) {
      return NextResponse.json(
        createErrorResponse('INVALID_INPUT', 'amount must be a positive number', 400),
        { status: 400 }
      );
    }

    // デバイス検証とユーザーID取得
    const device = await verifyDevice(deviceId);
    if (!device || !device.isActive || !device.userId) {
      return NextResponse.json(
        createErrorResponse('DEVICE_NOT_REGISTERED', 'Device is not registered or inactive', 403),
        { status: 403 }
      );
    }

    // デバイスの最終接続時刻を更新
    const db = getDB();
    if (db) {
      await db.collection('devices').doc(deviceId).update({
        lastSeen: Timestamp.now()
      });
    }

    // データ保存
    await saveDailyUsage(
      device.userId,
      usageType as 'water' | 'electricity',
      amount
    );

    return NextResponse.json(
      createSuccessResponse({ 
        message: 'Usage data logged successfully',
        deviceId,
        userId: device.userId,
        timestamp: new Date().toISOString()
      })
    );

  } catch (error) {
    console.error('Error in log-device-usage API:', error);
    return NextResponse.json(
      createErrorResponse('INTERNAL_ERROR', 'Internal server error', 500),
      { status: 500 }
    );
  }
}