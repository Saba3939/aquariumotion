# ESP32実装ガイド - Phase1

## 概要
AQUARIUMOTION向けESP32デバイス実装ガイドです。水道・電気使用量センサーデータをAPIに送信する機能を実装します。

## ハードウェア構成

### 水道使用量センサー
- **センサー**: 水流センサー（例：YF-S201）
- **接続**: GPIO2ピンにパルス信号入力
- **計測**: パルス数から流量計算（L/min）

### 電気使用量センサー
- **センサー**: 電流センサー（例：SCT-013-030）
- **接続**: ADCピン（GPIO34/GPIO35）経由
- **計測**: 電流値から消費電力計算（W）

## ESP32コード実装

### 1. ライブラリ設定

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// WiFi設定
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// API設定
const char* apiBaseUrl = "https://your-domain.vercel.app";
const char* apiKey = "YOUR_ESP32_API_KEY";

// デバイス設定
String deviceId = "";
String userId = "";
bool isLinked = false;

Preferences preferences;
```

### 2. デバイス登録フロー

```cpp
bool registerDevice(const char* deviceType) {
  HTTPClient http;
  http.begin(String(apiBaseUrl) + "/api/register-device");
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
      deviceId = responseDoc["data"]["deviceId"].as<String>();
      String regCode = responseDoc["data"]["registrationCode"].as<String>();
      
      // 登録コードを表示（LCD/LEDで表示）
      Serial.println("登録コード: " + regCode);
      displayRegistrationCode(regCode);
      
      // Preferencesに保存
      preferences.putString("deviceId", deviceId);
      preferences.putString("regCode", regCode);
      
      return true;
    }
  }
  
  http.end();
  return false;
}
```

### 3. 使用量データ送信

```cpp
bool sendUsageData(float amount, const char* usageType) {
  if (!isLinked || userId.isEmpty()) {
    Serial.println("デバイスが未登録です");
    return false;
  }
  
  HTTPClient http;
  http.begin(String(apiBaseUrl) + "/api/log-usage");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", apiKey);
  
  DynamicJsonDocument doc(300);
  doc["userId"] = userId;
  doc["usageType"] = usageType;
  doc["amount"] = amount;
  
  String requestBody;
  serializeJson(doc, requestBody);
  
  int httpResponseCode = http.POST(requestBody);
  bool success = (httpResponseCode == 200);
  
  if (success) {
    Serial.println("データ送信成功: " + String(amount) + " " + String(usageType));
  } else {
    Serial.println("データ送信失敗: " + String(httpResponseCode));
  }
  
  http.end();
  return success;
}
```

### 4. 水流センサー計測

```cpp
// 水流センサー設定
const int WATER_SENSOR_PIN = 2;
volatile long pulseCount = 0;
float calibrationFactor = 4.5; // センサー固有の校正値

void IRAM_ATTR pulseCounter() {
  pulseCount++;
}

void setupWaterSensor() {
  pinMode(WATER_SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(WATER_SENSOR_PIN), pulseCounter, FALLING);
}

float calculateWaterUsage() {
  static unsigned long lastTime = 0;
  static long lastPulseCount = 0;
  
  unsigned long currentTime = millis();
  long currentPulseCount = pulseCount;
  
  if (currentTime - lastTime >= 1000) { // 1秒間隔で計算
    float flowRate = ((currentPulseCount - lastPulseCount) * 60.0) / calibrationFactor;
    float litersPer1000ms = flowRate / 60.0;
    
    lastTime = currentTime;
    lastPulseCount = currentPulseCount;
    
    return litersPer1000ms;
  }
  
  return 0;
}
```

### 5. 電流センサー計測

```cpp
// 電流センサー設定
const int CURRENT_SENSOR_PIN = 34;
const float VOLTAGE_REF = 3.3;
const int ADC_RESOLUTION = 4096;

float calculateElectricityUsage() {
  int adcValue = analogRead(CURRENT_SENSOR_PIN);
  float voltage = (adcValue * VOLTAGE_REF) / ADC_RESOLUTION;
  
  // 電流値計算（センサー固有の変換式）
  float current = (voltage - 1.65) / 0.066; // SCT-013-030の場合
  if (current < 0) current = 0;
  
  // 消費電力計算（100V想定）
  float power = current * 100.0; // ワット
  
  return power;
}
```

### 6. メインループ実装

```cpp
void setup() {
  Serial.begin(115200);
  preferences.begin("aquarium", false);
  
  // WiFi接続
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("WiFi接続中...");
  }
  Serial.println("WiFi接続完了");
  
  // センサー初期化
  setupWaterSensor();
  
  // 保存されたデバイス情報読み込み
  deviceId = preferences.getString("deviceId", "");
  userId = preferences.getString("userId", "");
  isLinked = !userId.isEmpty();
  
  // 未登録の場合は登録実行
  if (deviceId.isEmpty()) {
    registerDevice("water"); // または "electricity"
  }
}

void loop() {
  // WiFi再接続チェック
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    return;
  }
  
  // 使用量計測（1分間隔）
  static unsigned long lastSend = 0;
  if (millis() - lastSend >= 60000) { // 1分間隔
    
    // 水道使用量送信
    float waterUsage = calculateWaterUsage();
    if (waterUsage > 0) {
      sendUsageData(waterUsage, "water");
    }
    
    // 電気使用量送信
    float electricityUsage = calculateElectricityUsage();
    if (electricityUsage > 0) {
      sendUsageData(electricityUsage, "electricity");
    }
    
    lastSend = millis();
  }
  
  delay(1000);
}
```

## デバイス設定フロー

### 1. ESP32初期設定
1. デバイスを起動
2. WiFiに接続
3. `/api/register-device` で登録
4. 8桁登録コードをLCD/LED表示

### 2. ユーザー側設定
1. AQUARIUMOTIONアプリでデバイス登録画面を開く
2. ESP32に表示された8桁コードを入力
3. 紐付け完了後、データ収集開始

### 3. データ収集開始
- 1分間隔で使用量データをAPIに送信
- エラー時は3回まで再送信
- デバイス状態を定期的に更新

## 必要な環境変数

```bash
# .env.local に設定
ESP32_API_KEY=your_secure_api_key_here
```

## トラブルシューティング

### よくある問題

1. **WiFi接続失敗**
   - SSID/パスワードの確認
   - 電波強度の確認

2. **API呼び出し失敗**
   - インターネット接続の確認
   - API-KEYの設定確認
   - HTTPSサポートの確認

3. **センサー値異常**
   - 接続配線の確認
   - 校正値の調整
   - ノイズフィルタリング

### デバッグログ

```cpp
// デバッグ用のシリアル出力
Serial.println("WiFi Status: " + String(WiFi.status()));
Serial.println("Device ID: " + deviceId);
Serial.println("User ID: " + userId);
Serial.println("Is Linked: " + String(isLinked));
```