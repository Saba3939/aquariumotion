# 18. デバイス連携機能実装完了報告

## 概要
ESP32等のIoTデバイスとWebアプリケーションを連携させるデバイス管理システムの実装が完了しました。ユーザーはWebアプリを通じてデバイスを登録・管理し、リアルタイムでデータを受信できます。

## 実装完了機能

### 1. APIエンドポイント

#### デバイス登録系
- **POST /api/register-device**
  - ESP32からの登録リクエスト処理
  - 8桁登録コード生成
  - デバイス情報のFirestore保存

- **POST /api/link-device**
  - ユーザーとデバイスの紐付け
  - Firebase認証による安全な登録
  - 登録コード検証

#### デバイス管理系
- **GET /api/user-devices**
  - ユーザーの登録済みデバイス情報取得
  - Firebase認証必須

- **POST /api/device-details**
  - デバイス詳細情報取得（複数対応）
  - 最終接続日時、ステータス情報含む

- **POST /api/unlink-device**
  - デバイス登録解除
  - 所有者検証による安全な解除

### 2. データベース設計

#### devices/{deviceId}
```typescript
interface Device {
  deviceId: string;           // デバイス一意ID
  deviceType: 'electricity' | 'water';  // デバイス種類
  userId?: string;            // 紐付けユーザー（未登録時はnull）
  registrationCode: string;   // 登録用8桁コード
  isActive: boolean;          // 有効フラグ
  lastSeen: Timestamp;        // 最終接続日時
  createdAt: Timestamp;       // 登録日時
}
```

#### userDevices/{userId}
```typescript
interface UserDevices {
  electricityDeviceId?: string;  // 電気使用量デバイスID
  waterDeviceId?: string;        // 水道使用量デバイスID
  lastUpdated: Timestamp;        // 最終更新日時
}
```

### 3. フロントエンド機能

#### メイン画面統合
- ナビゲーションに「デバイス管理」タブ追加
- Settings アイコン使用
- 認証状態に応じた表示制御

#### デバイス登録画面
- **登録コード入力フィールド**
  - 8桁英数字（大文字自動変換）
  - リアルタイム入力検証
  - ESP32表示コード対応

- **登録手順ガイド**
  - ステップバイステップの説明
  - ESP32操作方法明記

#### デバイス管理画面
- **登録済みデバイス一覧**
  - デバイス種類表示（電気/水道）
  - デバイスID表示
  - 登録日時表示
  - 最終接続日時表示

- **デバイス状態監視**
  - オンライン：1時間以内接続
  - 最近：24時間以内接続
  - オフライン：24時間以上未接続
  - 色分け表示（緑/黄/赤）

- **デバイス解除機能**
  - 確認ダイアログ付き安全な解除
  - 即座の状態反映

### 4. セキュリティ機能

#### 認証・認可
- Firebase ID Token認証
- API呼び出し時のトークン検証
- デバイス所有者確認

#### 登録セキュリティ
- 8桁ランダムコード生成
- 一意性保証
- 使用済みコード無効化

## ESP32側実装ガイド

### 必要ライブラリ
```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
```

### デバイス登録フロー
1. **初回起動時**
   - WiFi接続
   - `/api/register-device` に登録リクエスト
   - 受信した8桁コードをLCD/シリアル表示

2. **ユーザー操作**
   - Webアプリでコード入力
   - デバイス有効化完了

3. **データ送信開始**
   - 1分間隔でセンサーデータ送信
   - `/api/log-usage` エンドポイント使用

### サンプルコード（デバイス登録）
```cpp
bool registerDevice(const char* deviceType) {
  HTTPClient http;
  http.begin("https://your-domain.vercel.app/api/register-device");
  http.addHeader("Content-Type", "application/json");
  
  DynamicJsonDocument doc(200);
  doc["deviceType"] = deviceType;
  
  String requestBody;
  serializeJson(doc, requestBody);
  
  int httpResponseCode = http.POST(requestBody);
  
  if (httpResponseCode == 200) {
    String response = http.getString();
    DynamicJsonDocument responseDoc(1024);
    deserializeJson(responseDoc, response);
    
    if (responseDoc["success"]) {
      String deviceId = responseDoc["data"]["deviceId"];
      String regCode = responseDoc["data"]["registrationCode"];
      
      // 登録コードを表示
      Serial.println("登録コード: " + regCode);
      displayOnLCD(regCode);
      
      return true;
    }
  }
  
  http.end();
  return false;
}
```

## 使用方法

### 1. ESP32デバイス設定
1. ESP32にファームウェア書き込み
2. WiFiネットワーク接続
3. デバイス起動時に登録コード表示確認

### 2. Webアプリでの登録
1. AQUARIUMOTIONにログイン
2. 「デバイス管理」タブをクリック
3. 「デバイス登録」で8桁コードを入力
4. 「デバイスを登録」ボタンをクリック

### 3. データ収集開始
- 登録完了後、ESP32が自動的にデータ送信開始
- 1分間隔で使用量データをAPI送信
- Webアプリで水族館への反映確認

## トラブルシューティング

### 一般的な問題

#### デバイス登録失敗
**症状**: 登録コードが受け付けられない
**対処**: 
- コードの大文字小文字確認
- ESP32の再起動
- WiFi接続状態確認

#### デバイスがオフライン表示
**症状**: 登録済みデバイスがオフライン
**対処**:
- ESP32の電源状態確認
- WiFiネットワーク接続確認
- シリアルモニターでエラーログ確認

#### データが反映されない
**症状**: センサーデータが水族館に反映されない
**対処**:
- `/api/log-usage` エンドポイントの動作確認
- ESP32のセンサー値出力確認
- API認証キーの設定確認

## 今後の拡張予定

### Phase 3: 高度な機能
- [ ] デバイス管理画面の詳細表示
- [ ] データ送信履歴表示
- [ ] デバイス設定変更機能
- [ ] バッテリー残量表示
- [ ] ファームウェア更新機能

### Phase 4: 分析機能
- [ ] デバイス別使用量グラフ
- [ ] 省エネ効果レポート
- [ ] 異常値検知アラート
- [ ] 予測分析機能

## 技術仕様

### 対応デバイス
- ESP32系マイコン
- WiFi接続必須
- センサー接続（電流/水流）

### API仕様
- REST API
- JSON形式
- Firebase認証
- HTTPS必須

### データ形式
```json
{
  "userId": "string",
  "usageType": "water|electricity", 
  "amount": "number",
  "timestamp": "ISO8601"
}
```

## 参考資料
- [Phase1 ESP32実装ガイド](./Phase1-ESP32-Implementation-Guide.md)
- [デバイス登録システム](./16-device-registration.md)
- [API使用方法](./Phase1-API-Usage-Guide.md)

---

**実装完了日**: 2025年1月15日  
**実装者**: Claude Code Assistant  
**レビュー**: 要確認