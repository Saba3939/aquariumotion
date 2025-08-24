# Phase1 API使用ガイド

## 概要
ESP・ハードウェア基盤のためのAPI実装が完了しました。このドキュメントでは、実装されたAPIの使用方法について説明します。

## 実装されたAPI

### 1. POST /api/log-usage - 使用量データ記録

ESP32デバイスから水・電気使用量データを送信するためのエンドポイント。

#### リクエスト
```http
POST /api/log-usage
Content-Type: application/json
X-API-Key: [ESP32_API_KEY]

{
  "userId": "user123",
  "usageType": "water",
  "amount": 15.5
}
```

#### レスポンス（成功）
```json
{
  "success": true,
  "data": {
    "message": "Usage data logged successfully"
  }
}
```

#### レスポンス（エラー）
```json
{
  "success": false,
  "error": "INVALID_INPUT",
  "message": "使用量は正の数値である必要があります",
  "code": 400
}
```

#### パラメータ
- `userId` (string, 必須): ユーザーID
- `usageType` (string, 必須): "water" または "electricity"
- `amount` (number, 必須): 使用量（正の数値）

### 2. POST /api/register-device - デバイス登録

新しいESP32デバイスを登録し、登録コードを発行します。

#### リクエスト
```http
POST /api/register-device
Content-Type: application/json

{
  "deviceType": "electricity"
}
```

#### レスポンス（成功）
```json
{
  "success": true,
  "data": {
    "deviceId": "electricity_1692345678901_abc123def",
    "registrationCode": "XYZ12ABC",
    "message": "Device registered successfully"
  }
}
```

#### パラメータ
- `deviceType` (string, 必須): "electricity" または "water"

### 3. POST /api/link-device - デバイス紐付け

登録されたデバイスをユーザーアカウントに紐付けます。

#### リクエスト
```http
POST /api/link-device
Content-Type: application/json
Authorization: Bearer [Firebase_ID_Token]

{
  "registrationCode": "XYZ12ABC"
}
```

#### レスポンス（成功）
```json
{
  "success": true,
  "data": {
    "message": "Device linked successfully"
  }
}
```

#### パラメータ
- `registrationCode` (string, 必須): デバイス登録時に発行された8桁コード

## 認証方式

### ESP32 API認証
- ヘッダー: `X-API-Key: [ESP32_API_KEY]`
- 環境変数 `ESP32_API_KEY` で設定

### ユーザー認証
- ヘッダー: `Authorization: Bearer [Firebase_ID_Token]`
- Firebase Authentication IDトークンを使用

## エラーコード

| エラーコード | 説明 |
|-------------|------|
| 400 | INVALID_INPUT - 入力データエラー |
| 400 | INVALID_CONTENT_TYPE - Content-Type不正 |
| 401 | UNAUTHORIZED - 認証エラー |
| 404 | DEVICE_NOT_FOUND - デバイスが見つからない |
| 500 | INTERNAL_ERROR - サーバー内部エラー |

## Firestore データ構造

### dailyUsage/{userId}_{YYYY-MM-DD}
```typescript
{
  userId: string;
  date: string;
  waterUsage?: number;
  electricityUsage?: number;
  conservationScore?: number;
}
```

### devices/{deviceId}
```typescript
{
  deviceId: string;
  deviceType: 'electricity' | 'water';
  userId?: string;
  registrationCode: string;
  isActive: boolean;
  lastSeen: Timestamp;
  createdAt: Timestamp;
}
```

### userDevices/{userId}
```typescript
{
  electricityDeviceId?: string;
  waterDeviceId?: string;
  lastUpdated: Timestamp;
}
```

## セキュリティ考慮事項

1. **API-KEY管理**: ESP32_API_KEYは環境変数で管理
2. **トークン検証**: Firebase ID Tokenの厳密な検証
3. **デバイス認証**: 登録コードによる一意性確保
4. **データ検証**: 全入力パラメータの型・範囲チェック