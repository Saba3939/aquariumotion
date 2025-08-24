// データ検証・エラーハンドリングユーティリティ

// API共通エラーレスポンス型
export interface ApiErrorResponse {
  success: false;
  error: string;
  message: string;
  code: number;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// 使用量データ検証
export interface LogUsageRequest {
  userId: string;
  usageType: 'water' | 'electricity';
  amount: number;
}

export function validateLogUsageRequest(body: unknown): LogUsageRequest | string {
  if (!body || typeof body !== 'object') {
    return 'リクエストボディが必要です';
  }

  const data = body as Record<string, unknown>;

  if (!data.userId || typeof data.userId !== 'string' || data.userId.trim() === '') {
    return 'userIdは必須で、空でない文字列である必要があります';
  }

  if (!data.usageType || !['water', 'electricity'].includes(data.usageType as string)) {
    return 'usageTypeは"water"または"electricity"である必要があります';
  }

  if (typeof data.amount !== 'number' || data.amount <= 0) {
    return '使用量は正の数値である必要があります';
  }

  return {
    userId: data.userId.trim(),
    usageType: data.usageType as 'water' | 'electricity',
    amount: data.amount
  };
}

// デバイス登録データ検証
export interface RegisterDeviceRequest {
  deviceType: 'electricity' | 'water';
}

export function validateRegisterDeviceRequest(body: unknown): RegisterDeviceRequest | string {
  if (!body || typeof body !== 'object') {
    return 'リクエストボディが必要です';
  }

  const data = body as Record<string, unknown>;

  if (!data.deviceType || !['electricity', 'water'].includes(data.deviceType as string)) {
    return 'deviceTypeは"electricity"または"water"である必要があります';
  }

  return {
    deviceType: data.deviceType as 'electricity' | 'water'
  };
}

// デバイス紐付けデータ検証
export interface LinkDeviceRequest {
  registrationCode: string;
}

export function validateLinkDeviceRequest(body: unknown): LinkDeviceRequest | string {
  if (!body || typeof body !== 'object') {
    return 'リクエストボディが必要です';
  }

  const data = body as Record<string, unknown>;

  if (!data.registrationCode || typeof data.registrationCode !== 'string' || data.registrationCode.trim() === '') {
    return 'registrationCodeは必須で、空でない文字列である必要があります';
  }

  return {
    registrationCode: data.registrationCode.trim()
  };
}

// エラーレスポンス生成
export function createErrorResponse(error: string, message: string, code: number): ApiErrorResponse {
  return {
    success: false,
    error,
    message,
    code
  };
}

// 成功レスポンス生成
export function createSuccessResponse<T>(data: T): ApiSuccessResponse<T> {
  return {
    success: true,
    data
  };
}