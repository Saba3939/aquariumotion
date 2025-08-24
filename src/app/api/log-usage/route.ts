import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey } from '../../../lib/firebase-server';
import { saveDailyUsage } from '../../../lib/firestore-utils';
import { 
  validateLogUsageRequest, 
  createErrorResponse, 
  createSuccessResponse 
} from '../../../lib/validation';

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
    
    // データ検証
    const validationResult = validateLogUsageRequest(body);
    if (typeof validationResult === 'string') {
      return NextResponse.json(
        createErrorResponse('INVALID_INPUT', validationResult, 400),
        { status: 400 }
      );
    }

    // データ保存
    await saveDailyUsage(
      validationResult.userId,
      validationResult.usageType,
      validationResult.amount
    );

    return NextResponse.json(
      createSuccessResponse({ message: 'Usage data logged successfully' })
    );

  } catch (error) {
    console.error('Error in log-usage API:', error);
    return NextResponse.json(
      createErrorResponse('INTERNAL_ERROR', 'Internal server error', 500),
      { status: 500 }
    );
  }
}