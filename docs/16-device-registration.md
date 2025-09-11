# 16. デバイス登録システム実装

## 概要
ESP32等の節電デバイスを登録し、ユーザーと紐付けてデータ収集を可能にするシステムを実装。

## 機能要件

### デバイス登録フロー
1. **デバイス初期設定**: ESP32からの登録リクエスト
2. **ユーザー紐付け**: Webアプリでのデバイス認証・登録
3. **データ収集開始**: 登録完了後の自動データ送信

### API エンドポイント
1. **POST /api/register-device** - デバイス登録
   - デバイスID生成・保存
   - ユーザーとの紐付け
   - 認証キー発行

2. **POST /api/link-device** - ユーザーとデバイス紐付け
   - QRコード・PIN認証
   - デバイス有効化

## データベース設計

### devices/{deviceId}
```typescript
interface Device {
  deviceId: string;           // デバイス一意ID
  deviceType: 'electricity' | 'water';  // デバイス種類
  userId?: string;            // 紐付けユーザー（未登録時はnull）
  registrationCode: string;   // 登録用PINコード
  isActive: boolean;          // 有効フラグ
  lastSeen: Timestamp;        // 最終接続日時
  createdAt: Timestamp;       // 登録日時
}
```

### userDevices/{userId}
```typescript
interface UserDevices {
  electricityDeviceId?: string;
  waterDeviceId?: string;
  lastUpdated: Timestamp;
}
```

## 実装要件

### フロントエンド
1. デバイス登録UI（QRスキャン・PIN入力）
2. 登録済みデバイス一覧表示
3. デバイス状態監視
4. 登録解除機能

### バックエンド
1. デバイス登録API実装
2. PIN生成・検証機能
3. デバイス認証システム
4. データ収集時のデバイス検証

### セキュリティ
1. デバイス認証トークン管理
2. 登録コード有効期限
3. 不正アクセス検知
4. デバイス無効化機能

## ステータス
- [x] データベーススキーマ設計 ✅ 完了 (2025/01/15)
- [x] デバイス登録API実装 ✅ 完了 (2025/01/15)
- [x] ユーザー紐付けAPI実装 ✅ 完了 (2025/01/15)
- [x] 登録UI実装 ✅ 完了 (2025/01/15)
- [x] デバイス管理UI実装 ✅ 完了 (2025/01/15)
- [x] セキュリティ機能実装 ✅ 完了 (2025/01/15)
- [x] テスト・検証 ✅ 完了 (2025/01/15)

## 実装完了詳細

### 実装されたAPIエンドポイント
1. **POST /api/register-device** - ESP32デバイス登録
2. **POST /api/link-device** - ユーザーとデバイス紐付け
3. **GET /api/user-devices** - ユーザーデバイス情報取得
4. **POST /api/device-details** - デバイス詳細情報取得
5. **POST /api/unlink-device** - デバイス登録解除

### 実装されたFirestore関数
- `registerDevice()` - デバイス登録処理
- `linkDeviceToUser()` - デバイス・ユーザー紐付け
- `getUserDevices()` - ユーザーデバイス情報取得
- `getDeviceDetails()` - デバイス詳細取得
- `unlinkDeviceFromUser()` - デバイス登録解除

### フロントエンド実装
- **デバイス管理タブ**: メイン画面に統合完了
- **登録画面**: 8桁PINコード入力、ステップガイド付き
- **管理画面**: デバイス一覧、状態表示、解除機能
- **認証統合**: Firebase認証と完全連携

### セキュリティ実装
- Firebase ID Token認証
- デバイス所有者検証
- 8桁ランダム登録コード
- 安全な登録・解除フロー

詳細な実装内容は [18-device-integration-implementation.md](./18-device-integration-implementation.md) を参照。