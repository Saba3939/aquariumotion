# ESP デバイス API 統合ガイド

このドキュメントでは、ESPデバイス（ESP32/ESP8266）からAQUARIUMOTIONアプリケーションのAPIに電気・水道使用量データを送信する方法を説明します。

## 概要

ESPデバイスから使用量データを送信するには以下のステップが必要です：

1. **デバイス登録** - デバイスIDと登録コードを取得
2. **デバイス連携** - ユーザーがアプリでデバイスを連携
3. **使用量データ送信** - 実際の電気・水道使用量を送信

## 1. デバイス登録

### エンドポイント
```
POST /api/register-device
```

### リクエスト
```http
Content-Type: application/json

{
  "deviceType": "electricity" | "water"
}
```

### レスポンス
```json
{
  "success": true,
  "data": {
    "deviceId": "device_xxxxxxxx",
    "registrationCode": "123456",
    "message": "Device registered successfully"
  }
}
```

### ESP32実装例
```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

String registerDevice(String deviceType) {
  HTTPClient http;
  http.begin("https://your-domain.com/api/register-device");
  http.addHeader("Content-Type", "application/json");
  
  DynamicJsonDocument doc(1024);
  doc["deviceType"] = deviceType;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode == 200) {
    String response = http.getString();
    DynamicJsonDocument responseDoc(1024);
    deserializeJson(responseDoc, response);
    
    String deviceId = responseDoc["data"]["deviceId"];
    String registrationCode = responseDoc["data"]["registrationCode"];
    
    Serial.println("Device ID: " + deviceId);
    Serial.println("Registration Code: " + registrationCode);
    
    http.end();
    return deviceId;
  }
  
  http.end();
  return "";
}
```

## 2. デバイス状態確認

### エンドポイント
```
POST /api/check-device-status
```

### リクエスト
```http
Content-Type: application/json

{
  "deviceId": "device_xxxxxxxx"
}
```

### レスポンス
```json
{
  "success": true,
  "data": {
    "deviceId": "device_xxxxxxxx",
    "isActive": true,
    "userId": "user_xxxxxxxx",
    "deviceType": "electricity",
    "lastSeen": "2025-01-16T12:00:00.000Z"
  }
}
```

### ESP32実装例
```cpp
bool checkDeviceStatus(String deviceId) {
  HTTPClient http;
  http.begin("https://your-domain.com/api/check-device-status");
  http.addHeader("Content-Type", "application/json");
  
  DynamicJsonDocument doc(512);
  doc["deviceId"] = deviceId;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode == 200) {
    String response = http.getString();
    DynamicJsonDocument responseDoc(1024);
    deserializeJson(responseDoc, response);
    
    bool isActive = responseDoc["data"]["isActive"];
    String userId = responseDoc["data"]["userId"];
    
    http.end();
    return isActive && userId != "null";
  }
  
  http.end();
  return false;
}
```

## 3. 使用量データ送信

### エンドポイント
```
POST /api/log-device-usage
```

### 必要なヘッダー
```http
Content-Type: application/json
x-api-key: YOUR_API_KEY
```

### リクエスト
```http
{
  "deviceId": "device_xxxxxxxx",
  "usageType": "electricity" | "water",
  "amount": 数値（正の数）
}
```

### レスポンス
```json
{
  "success": true,
  "data": {
    "message": "Usage data logged successfully",
    "deviceId": "device_xxxxxxxx",
    "userId": "user_xxxxxxxx",
    "timestamp": "2025-01-16T12:00:00.000Z"
  }
}
```

### ESP32実装例
```cpp
bool sendUsageData(String deviceId, String usageType, float amount, String apiKey) {
  HTTPClient http;
  http.begin("https://your-domain.com/api/log-device-usage");
  
  // ヘッダー設定
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", apiKey);
  
  // JSON作成
  DynamicJsonDocument doc(1024);
  doc["deviceId"] = deviceId;
  doc["usageType"] = usageType;
  doc["amount"] = amount;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  // POST送信
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode == 200) {
    Serial.println("データ送信成功");
    String response = http.getString();
    Serial.println("Response: " + response);
    http.end();
    return true;
  } else {
    Serial.println("送信失敗: " + String(httpResponseCode));
    String errorResponse = http.getString();
    Serial.println("Error: " + errorResponse);
    http.end();
    return false;
  }
}
```

## 4. 完全なESP32実装例

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// 設定
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const String apiUrl = "https://your-domain.com";
const String apiKey = "YOUR_API_KEY";
const String deviceType = "electricity"; // または "water"

String deviceId = "";
unsigned long lastSensorRead = 0;
const unsigned long sensorInterval = 60000; // 1分間隔

void setup() {
  Serial.begin(115200);
  
  // WiFi接続
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("WiFi接続中...");
  }
  Serial.println("WiFi接続完了");
  
  // デバイス登録
  deviceId = registerDevice(deviceType);
  if (deviceId.length() > 0) {
    Serial.println("デバイス登録完了: " + deviceId);
  } else {
    Serial.println("デバイス登録失敗");
    return;
  }
  
  // デバイスがアクティブになるまで待機
  Serial.println("ユーザーがアプリでデバイスを連携するまで待機中...");
  while (!checkDeviceStatus(deviceId)) {
    delay(30000); // 30秒間隔でチェック
    Serial.println("デバイス連携待機中...");
  }
  Serial.println("デバイス連携完了！");
}

void loop() {
  unsigned long currentTime = millis();
  
  if (currentTime - lastSensorRead >= sensorInterval) {
    // センサーから使用量を読み取り（例：電力量）
    float usageAmount = readSensorData();
    
    if (usageAmount > 0) {
      // データ送信
      bool success = sendUsageData(deviceId, deviceType, usageAmount, apiKey);
      if (success) {
        Serial.println("使用量データ送信成功: " + String(usageAmount));
      } else {
        Serial.println("使用量データ送信失敗");
      }
    }
    
    lastSensorRead = currentTime;
  }
  
  delay(1000);
}

float readSensorData() {
  // センサーから実際のデータを読み取る実装
  // 例：電流センサー、電力メーターなど
  return random(100, 500) / 100.0; // デモ用のランダム値
}

// 上記の関数実装をここに含める
String registerDevice(String deviceType) { /* 実装済み */ }
bool checkDeviceStatus(String deviceId) { /* 実装済み */ }
bool sendUsageData(String deviceId, String usageType, float amount, String apiKey) { /* 実装済み */ }
```

## 5. エラーハンドリング

### よくあるエラーと対処法

| エラーコード | 説明 | 対処法 |
|-------------|------|--------|
| 400 | リクエストデータが不正 | JSON形式、必須フィールドを確認 |
| 401 | API-KEY認証失敗 | x-api-keyヘッダーとAPIキーを確認 |
| 403 | デバイスが未登録/非アクティブ | デバイス登録・連携状態を確認 |
| 404 | デバイスが見つからない | deviceIdが正しいか確認 |
| 500 | サーバーエラー | 少し時間をおいて再試行 |

### 実装のベストプラクティス

1. **接続確認**: データ送信前にWiFi接続状態を確認
2. **リトライ機構**: 送信失敗時の再試行ロジックを実装
3. **データバッファリング**: ネットワーク障害時のデータ保存
4. **セキュリティ**: API-KEYの安全な保存
5. **ログ**: デバッグ用の適切なログ出力

## 6. 設定情報

### 必要な情報
- **WiFi SSID/パスワード**: インターネット接続用
- **API URL**: アプリケーションのベースURL
- **API-KEY**: API認証用キー（アプリ管理画面で取得）
- **デバイスタイプ**: "electricity" または "water"

### セキュリティ考慮事項
- API-KEYをハードコードしない
- HTTPSを使用する
- 適切な証明書検証を実装
- センサーデータの妥当性チェック

このガイドに従って実装することで、ESPデバイスからAQUARIUMOTIONアプリケーションに安全かつ確実に使用量データを送信できます。