import { NextRequest, NextResponse } from 'next/server';
import { registerDevice } from '../../../lib/firestore-utils';
import { 
  validateRegisterDeviceRequest, 
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
    
    // データ検証
    const validationResult = validateRegisterDeviceRequest(body);
    if (typeof validationResult === 'string') {
      return NextResponse.json(
        createErrorResponse('INVALID_INPUT', validationResult, 400),
        { status: 400 }
      );
    }

    // デバイス登録
    const device = await registerDevice(validationResult.deviceType);

    return NextResponse.json(
      createSuccessResponse({
        deviceId: device.deviceId,
        registrationCode: device.registrationCode,
        message: 'Device registered successfully'
      })
    );

  } catch (error) {
    console.error('Error in register-device API:', error);
    return NextResponse.json(
      createErrorResponse('INTERNAL_ERROR', 'Internal server error', 500),
      { status: 500 }
    );
  }
}