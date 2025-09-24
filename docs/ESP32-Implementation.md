# ESP32 実装要件とプログラム

## 概要

ESP32は水流センサー（YF-S201）を制御し、リアルタイムで水使用量を測定・記録し、Firebase Realtime Databaseを介してサーバーと通信します。

## ハードウェア要件

### 必要な機器
- **ESP32 DevKit V1** (推奨) または同等品
- **YF-S201 水流センサー**
- **プルアップ抵抗** (10kΩ)
- **ジャンパーワイヤー**
- **ブレッドボード**
- **電源供給** (USB または 5V/3.3V)

### 配線図

```
YF-S201 水流センサー → ESP32
赤線 (VCC) → 5V
黒線 (GND) → GND
黄線 (Signal) → GPIO 2 (プルアップ抵抝10kΩ付き)

追加接続:
LED (緑) → GPIO 18 (動作状態表示)
LED (赤) → GPIO 19 (エラー状態表示)
ブザー → GPIO 21 (オプション)
```

## ソフトウェア要件

### Arduino IDE設定
```
1. Arduino IDEに ESP32 ボードマネージャを追加
   File → Preferences → Additional Board Manager URLs:
   https://dl.espressif.com/dl/package_esp32_index.json

2. Tools → Board → ESP32 Arduino → ESP32 Dev Module

3. 必要ライブラリをインストール:
   - WiFi (ESP32内蔵)
   - FirebaseESP32 by Mobizt
   - ArduinoJson by Benoit Blanchon
   - ESP32Time by Felix Biego (時刻管理用)
```

## メインプログラム

### `water_flow_monitor.ino`

```cpp
/*
 * ESP32 水流測定システム
 * 水流センサーからのパルスを計測し、使用量をリアルタイムで記録
 * Firebase Realtime Database経由でサーバーと通信
 */

#include <WiFi.h>
#include <FirebaseESP32.h>
#include <ArduinoJson.h>
#include <ESP32Time.h>

// ライブラリ設定
#define FIREBASE_HOST "your-project-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH "your-database-secret"

// WiFi設定
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Firebase設定
FirebaseData firebaseData;
FirebaseAuth auth;
FirebaseConfig config;

// デバイス設定
const String DEVICE_ID = "water_device_001";
const String API_BASE_URL = "https://your-app.vercel.app";
const String API_KEY = "your_esp32_api_key";

// ピン設定
const int FLOW_SENSOR_PIN = 2;
const int GREEN_LED_PIN = 18;
const int RED_LED_PIN = 19;
const int BUZZER_PIN = 21;

// 水流センサー変数
volatile long pulseCount = 0;
float flowRate = 0.0;
unsigned long previousMillis = 0;
const unsigned long MEASURE_INTERVAL = 1000; // 1秒間隔で測定

// セッション管理
struct WaterSession {
  String sessionId;
  String userId;
  unsigned long startTime;
  float totalAmount;
  bool isActive;
  bool autoStopEnabled;
  unsigned long lastFlowTime;
  unsigned long noFlowTimeout;
} currentSession;

// 時刻管理
ESP32Time rtc;

// 関数プロトタイプ
void IRAM_ATTR pulseCounter();
void initializeSystem();
void connectWiFi();
void initializeFirebase();
void handleFirebaseCommands();
void measureFlowRate();
void processSession();
void sendMeasurementData();
void handleAutoStop();
void updateDeviceStatus();
void showStatus(String status, bool isError = false);

void setup() {
  Serial.begin(115200);

  // ピン初期化
  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  // パルスカウンター割り込み設定
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), pulseCounter, RISING);

  // システム初期化
  initializeSystem();

  Serial.println("🚰 ESP32 水流測定システム開始");
  showStatus("システム開始", false);
}

void loop() {
  // Firebase コマンド確認
  handleFirebaseCommands();

  // 水流測定
  measureFlowRate();

  // セッション処理
  processSession();

  // 自動停止チェック
  handleAutoStop();

  // デバイス状態更新
  updateDeviceStatus();

  delay(100); // 100ms間隔で実行
}

// パルスカウンター（割り込み処理）
void IRAM_ATTR pulseCounter() {
  pulseCount++;
  currentSession.lastFlowTime = millis();
}

void initializeSystem() {
  // 初期化
  currentSession.isActive = false;
  currentSession.autoStopEnabled = true;
  currentSession.noFlowTimeout = 300000; // 5分無流水で自動停止

  // WiFi接続
  connectWiFi();

  // Firebase初期化
  initializeFirebase();

  // 時刻同期
  configTime(9 * 3600, 0, "ntp.nict.jp", "time.google.com");

  // 初期状態をFirebaseに送信
  updateDeviceStatus();

  showStatus("初期化完了", false);
}

void connectWiFi() {
  WiFi.begin(ssid, password);
  Serial.print("WiFi接続中");

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("WiFi接続成功: ");
    Serial.println(WiFi.localIP());
    showStatus("WiFi接続成功", false);
  } else {
    Serial.println("WiFi接続失敗");
    showStatus("WiFi接続失敗", true);
  }
}

void initializeFirebase() {
  config.host = FIREBASE_HOST;
  config.signer.tokens.legacy_token = FIREBASE_AUTH;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  if (Firebase.ready()) {
    Serial.println("Firebase接続成功");
    showStatus("Firebase接続成功", false);
  } else {
    Serial.println("Firebase接続失敗");
    showStatus("Firebase接続失敗", true);
  }
}

void handleFirebaseCommands() {
  if (!Firebase.ready()) return;

  String commandPath = "/device_commands/" + DEVICE_ID;

  if (Firebase.getJSON(firebaseData, commandPath)) {
    if (firebaseData.dataType() == "json") {
      DynamicJsonDocument doc(1024);
      deserializeJson(doc, firebaseData.jsonString());

      if (!doc["processed"].as<bool>() && doc.containsKey("command")) {
        String command = doc["command"].as<String>();

        if (command == "start_measurement") {
          startMeasurement(doc);
        } else if (command == "stop_measurement") {
          stopMeasurement(doc);
        } else if (command == "force_stop") {
          forceStopMeasurement(doc);
        }

        // コマンドを処理済みとしてマーク
        Firebase.setString(firebaseData, commandPath + "/processed", "true");
      }
    }
  }
}

void startMeasurement(DynamicJsonDocument& cmd) {
  if (currentSession.isActive) {
    Serial.println("⚠️ 既にセッションがアクティブです");
    return;
  }

  currentSession.sessionId = cmd["sessionId"].as<String>();
  currentSession.userId = cmd["userId"].as<String>();
  currentSession.startTime = millis();
  currentSession.totalAmount = 0.0;
  currentSession.isActive = true;
  currentSession.lastFlowTime = millis();

  // パルスカウンターリセット
  pulseCount = 0;

  Serial.println("✅ 測定開始: " + currentSession.sessionId);
  showStatus("測定開始", false);

  // ブザーで開始を通知
  tone(BUZZER_PIN, 1000, 200);
}

void stopMeasurement(DynamicJsonDocument& cmd) {
  if (!currentSession.isActive) {
    Serial.println("⚠️ アクティブなセッションがありません");
    return;
  }

  String sessionId = cmd["sessionId"].as<String>();
  if (sessionId != currentSession.sessionId) {
    Serial.println("⚠️ セッションIDが一致しません");
    return;
  }

  // 最終測定データを送信
  sendMeasurementData();

  Serial.println("✅ 測定停止: " + currentSession.sessionId);
  showStatus("測定停止", false);

  // セッションリセット
  currentSession.isActive = false;

  // ブザーで停止を通知
  tone(BUZZER_PIN, 500, 500);
}

void forceStopMeasurement(DynamicJsonDocument& cmd) {
  if (!currentSession.isActive) return;

  String reason = cmd["reason"].as<String>();
  Serial.println("🛑 強制停止: " + reason);

  // 強制停止時は推定使用量でデータ送信
  sendMeasurementData();

  currentSession.isActive = false;
  showStatus("強制停止", true);

  // エラー音
  for (int i = 0; i < 3; i++) {
    tone(BUZZER_PIN, 800, 100);
    delay(150);
  }
}

void measureFlowRate() {
  unsigned long currentMillis = millis();

  if (currentMillis - previousMillis >= MEASURE_INTERVAL) {
    // パルスから流量計算
    // YF-S201: 約450パルス/リットル (製品により異なる)
    flowRate = (pulseCount / 450.0) * (60000.0 / MEASURE_INTERVAL); // L/min

    if (currentSession.isActive) {
      // 1秒間の使用量を累積
      float increment = (pulseCount / 450.0); // リットル
      currentSession.totalAmount += increment;

      if (increment > 0) {
        currentSession.lastFlowTime = currentMillis;
      }

      Serial.printf("流量: %.2f L/min, 累積: %.3f L\n",
                   flowRate, currentSession.totalAmount);
    }

    pulseCount = 0;
    previousMillis = currentMillis;
  }
}

void processSession() {
  if (!currentSession.isActive) return;

  // 定期的に使用量をサーバーに送信（30秒毎）
  static unsigned long lastUpdate = 0;
  if (millis() - lastUpdate > 30000) {
    updateSessionProgress();
    lastUpdate = millis();
  }
}

void handleAutoStop() {
  if (!currentSession.isActive || !currentSession.autoStopEnabled) return;

  unsigned long noFlowDuration = millis() - currentSession.lastFlowTime;

  // 無流水タイムアウトチェック
  if (noFlowDuration > currentSession.noFlowTimeout) {
    Serial.println("⏰ 無流水タイムアウトによる自動停止");

    // 最終データ送信
    sendMeasurementData();

    currentSession.isActive = false;
    showStatus("自動停止", true);

    // タイムアウト音
    tone(BUZZER_PIN, 300, 1000);
  }

  // 長時間使用警告（30分）
  else if (millis() - currentSession.startTime > 1800000) {
    static unsigned long lastWarning = 0;
    if (millis() - lastWarning > 60000) { // 1分間隔で警告
      Serial.println("⚠️ 長時間使用中");
      tone(BUZZER_PIN, 1500, 100);
      lastWarning = millis();
    }
  }
}

void sendMeasurementData() {
  if (!currentSession.isActive) return;

  // HTTPクライアントでAPI呼び出し
  WiFiClient client;
  HTTPClient http;

  http.begin(client, API_BASE_URL + "/api/measurement-data");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);

  // 送信データ作成
  DynamicJsonDocument doc(512);
  doc["deviceId"] = DEVICE_ID;
  doc["sessionId"] = currentSession.sessionId;
  doc["totalAmount"] = round(currentSession.totalAmount * 1000) / 1000.0; // 小数点第3位まで
  doc["duration"] = (millis() - currentSession.startTime) / 1000; // 秒
  doc["endReason"] = "manual";

  String payload;
  serializeJson(doc, payload);

  int httpResponseCode = http.POST(payload);

  if (httpResponseCode == 200) {
    String response = http.getString();
    Serial.println("✅ 測定データ送信成功");
    Serial.println("レスポンス: " + response);
  } else {
    Serial.printf("❌ 測定データ送信失敗: %d\n", httpResponseCode);
  }

  http.end();
}

void updateSessionProgress() {
  // 進捗状況をFirebase Realtime Databaseに送信
  String statusPath = "/device_status/" + DEVICE_ID;

  DynamicJsonDocument doc(512);
  doc["deviceId"] = DEVICE_ID;
  doc["status"] = currentSession.isActive ? "measuring" : "idle";
  doc["sessionId"] = currentSession.sessionId;
  doc["currentAmount"] = currentSession.totalAmount;
  doc["flowRate"] = flowRate;
  doc["duration"] = (millis() - currentSession.startTime) / 1000;
  doc["lastUpdate"] = rtc.getEpoch();

  String jsonString;
  serializeJson(doc, jsonString);

  Firebase.setString(firebaseData, statusPath, jsonString);
}

void updateDeviceStatus() {
  static unsigned long lastStatusUpdate = 0;

  // 10秒毎にデバイス状態を更新
  if (millis() - lastStatusUpdate > 10000) {
    String statusPath = "/device_status/" + DEVICE_ID;

    DynamicJsonDocument doc(256);
    doc["deviceId"] = DEVICE_ID;
    doc["status"] = currentSession.isActive ? "measuring" : "idle";
    doc["wifiRSSI"] = WiFi.RSSI();
    doc["freeHeap"] = ESP.getFreeHeap();
    doc["uptime"] = millis() / 1000;
    doc["lastSeen"] = rtc.getEpoch();

    String jsonString;
    serializeJson(doc, jsonString);

    Firebase.setString(firebaseData, statusPath, jsonString);
    lastStatusUpdate = millis();
  }
}

void showStatus(String status, bool isError) {
  Serial.println("[" + status + "]");

  if (isError) {
    // エラー表示（赤LED点滅）
    for (int i = 0; i < 5; i++) {
      digitalWrite(RED_LED_PIN, HIGH);
      delay(100);
      digitalWrite(RED_LED_PIN, LOW);
      delay(100);
    }
  } else {
    // 正常表示（緑LED点滅）
    for (int i = 0; i < 3; i++) {
      digitalWrite(GREEN_LED_PIN, HIGH);
      delay(200);
      digitalWrite(GREEN_LED_PIN, LOW);
      delay(200);
    }
  }
}
```

## 設定ファイル

### `config.h`

```cpp
#ifndef CONFIG_H
#define CONFIG_H

// WiFi設定
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// Firebase設定
#define FIREBASE_HOST "your-project-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH "your-database-secret"

// API設定
#define API_BASE_URL "https://your-app.vercel.app"
#define API_KEY "your_esp32_api_key"

// デバイス設定
#define DEVICE_ID "water_device_001"

// センサー設定
#define FLOW_SENSOR_PULSES_PER_LITER 450  // YF-S201の仕様に合わせて調整
#define MEASUREMENT_INTERVAL 1000          // 測定間隔（ミリ秒）
#define NO_FLOW_TIMEOUT 300000             // 無流水タイムアウト（5分）
#define LONG_USE_WARNING_TIME 1800000      // 長時間使用警告（30分）

// ピン設定
#define FLOW_SENSOR_PIN 2
#define GREEN_LED_PIN 18
#define RED_LED_PIN 19
#define BUZZER_PIN 21

#endif
```

## キャリブレーション用プログラム

### `calibration.ino`

```cpp
/*
 * 水流センサーキャリブレーション用プログラム
 * 実際の水量とパルス数の関係を測定して校正係数を決定
 */

#include <WiFi.h>

const int FLOW_SENSOR_PIN = 2;
volatile long pulseCount = 0;
unsigned long startTime = 0;
bool measuring = false;

void IRAM_ATTR pulseCounter() {
  pulseCount++;
}

void setup() {
  Serial.begin(115200);
  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), pulseCounter, RISING);

  Serial.println("=== 水流センサーキャリブレーション ===");
  Serial.println("コマンド:");
  Serial.println("'start' - 測定開始");
  Serial.println("'stop' - 測定終了");
  Serial.println("'reset' - カウンターリセット");
}

void loop() {
  if (Serial.available()) {
    String command = Serial.readString();
    command.trim();

    if (command == "start") {
      pulseCount = 0;
      startTime = millis();
      measuring = true;
      Serial.println("📊 測定開始 - 正確な水量を流してください");

    } else if (command == "stop") {
      if (measuring) {
        unsigned long duration = millis() - startTime;
        measuring = false;

        Serial.println("📋 測定結果:");
        Serial.printf("測定時間: %lu 秒\n", duration / 1000);
        Serial.printf("総パルス数: %ld\n", pulseCount);
        Serial.println("実際に流した水量(L)を入力してください:");

        // 実際の水量入力待ち
        while (!Serial.available()) delay(100);
        float actualVolume = Serial.parseFloat();

        if (actualVolume > 0) {
          float pulsesPerLiter = pulseCount / actualVolume;
          Serial.printf("校正係数: %.2f パルス/L\n", pulsesPerLiter);
          Serial.printf("config.hのFLOW_SENSOR_PULSES_PER_LITERを %d に設定してください\n",
                       (int)round(pulsesPerLiter));
        }
      }

    } else if (command == "reset") {
      pulseCount = 0;
      Serial.println("🔄 カウンターリセット");
    }
  }

  // リアルタイム表示
  if (measuring) {
    static unsigned long lastDisplay = 0;
    if (millis() - lastDisplay > 1000) {
      Serial.printf("現在のパルス数: %ld\n", pulseCount);
      lastDisplay = millis();
    }
  }

  delay(100);
}
```

## OTA更新機能

### `ota_update.ino` (メインプログラムに追加)

```cpp
#include <ArduinoOTA.h>

void setupOTA() {
  // OTA設定
  ArduinoOTA.setHostname(DEVICE_ID.c_str());
  ArduinoOTA.setPassword("your_ota_password");

  ArduinoOTA.onStart([]() {
    String type;
    if (ArduinoOTA.getCommand() == U_FLASH) {
      type = "sketch";
    } else {
      type = "filesystem";
    }
    Serial.println("OTA更新開始: " + type);
  });

  ArduinoOTA.onEnd([]() {
    Serial.println("\nOTA更新完了");
  });

  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("進捗: %u%%\r", (progress / (total / 100)));
  });

  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("エラー[%u]: ", error);
    if (error == OTA_AUTH_ERROR) {
      Serial.println("認証失敗");
    } else if (error == OTA_BEGIN_ERROR) {
      Serial.println("開始失敗");
    } else if (error == OTA_CONNECT_ERROR) {
      Serial.println("接続失敗");
    } else if (error == OTA_RECEIVE_ERROR) {
      Serial.println("受信失敗");
    } else if (error == OTA_END_ERROR) {
      Serial.println("終了失敗");
    }
  });

  ArduinoOTA.begin();
}

// メインループに追加
void handleOTA() {
  ArduinoOTA.handle();
}
```

## 実装手順

### 1. ハードウェア準備
1. ESP32に水流センサーを配線
2. LED、ブザーを配線
3. 動作テスト

### 2. ソフトウェア準備
1. Arduino IDEの設定
2. 必要ライブラリのインストール
3. WiFi/Firebase設定

### 3. キャリブレーション
1. キャリブレーションプログラムで校正
2. 校正係数を本プログラムに設定
3. 精度確認

### 4. 動作確認
1. センサー動作テスト
2. Firebase通信テスト
3. API通信テスト

### 5. 本格運用
1. 最終プログラムの書き込み
2. 耐久テスト
3. エラーハンドリング確認

## トラブルシューティング

### よくある問題

1. **パルスが検出されない**
   - 配線確認
   - プルアップ抵抗確認
   - センサーの向き確認

2. **計測値が不正確**
   - キャリブレーション実施
   - センサーの汚れ確認
   - 流速の確認

3. **WiFi接続エラー**
   - SSIDとパスワード確認
   - 電波強度確認
   - ルーター設定確認

4. **Firebase通信エラー**
   - プロジェクト設定確認
   - 認証キー確認
   - ネットワーク確認

### デバッグ方法

```cpp
// シリアルモニター出力を詳細化
#define DEBUG_MODE 1

#if DEBUG_MODE
  #define DEBUG_PRINT(x) Serial.print(x)
  #define DEBUG_PRINTLN(x) Serial.println(x)
  #define DEBUG_PRINTF(x, ...) Serial.printf(x, __VA_ARGS__)
#else
  #define DEBUG_PRINT(x)
  #define DEBUG_PRINTLN(x)
  #define DEBUG_PRINTF(x, ...)
#endif
```

## セキュリティ考慮事項

1. **WiFi セキュリティ**
   - WPA2以上の暗号化
   - 強固なパスワード

2. **Firebase セキュリティ**
   - 適切なルール設定
   - 認証キーの管理

3. **OTA セキュリティ**
   - パスワード保護
   - 署名検証

## 性能最適化

### メモリ最適化
```cpp
// 文字列リテラルをFLASHに保存
#define F(string_literal) (reinterpret_cast<const __FlashStringHelper *>(PSTR(string_literal)))

// 不要な機能の無効化
#define CONFIG_ARDUHAL_LOG_DEFAULT_LEVEL 1
```

### 電力最適化
```cpp
#include <esp_sleep.h>

void enterLightSleep(uint64_t time_in_us) {
  esp_sleep_enable_timer_wakeup(time_in_us);
  esp_light_sleep_start();
}
```

これでESP32の完全な実装ドキュメントが完成しました。Raspberry PiとESP32両方の実装要件、プログラム、設定方法が詳細にまとめられています。