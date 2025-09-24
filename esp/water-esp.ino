/* 長すぎて使用していない
 * AQUARIUMOTION 水使用量測定システム - ESP32統合プログラム
 *
 * 機能:
 * - YF-S201水流センサーによる流量測定
 * - Firebase Realtime Databaseとの通信
 * - AQUARIUMOTIONサーバーAPIとの連携
 * - リアルタイム使用量監視
 * - 自動セッション管理
 *
 * 作成者: AQUARIUMOTION プロジェクト
 * 更新日: 2024-XX-XX
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <FirebaseESP32.h>
#include <ESP32Time.h>
#include <ArduinoOTA.h>

// ==================== 設定 ====================

// ==================== デプロイ設定 ====================
// 本番環境用の設定値です。実際の値に置き換えてください。

// WiFi設定
const char* WIFI_SSID = "YOUR_WIFI_SSID";        // 実際のWiFi SSID
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"; // 実際のWiFiパスワード

// Firebase設定
#define FIREBASE_HOST "aquariumotion-default-rtdb.firebaseio.com"
#define FIREBASE_API_KEY "your-firebase-web-api-key"  // Firebase Web API Key
#define FIREBASE_PROJECT_ID "aquariumotion"           // Firebase Project ID

// AQUARIUMOTION API設定
const String API_BASE_URL = "https://aquariumotion-nextjs.vercel.app";
const String ESP32_API_KEY = "your-esp32-api-key";  // 環境変数 ESP32_API_KEY の値

// デバイス設定
const String DEVICE_ID = "water_device_001";

// ピン設定
const int FLOW_SENSOR_PIN = 2;     // 水流センサー

// センサー設定
const float PULSES_PER_LITER = 450.0;  // YF-S201の校正値
const unsigned long MEASURE_INTERVAL = 1000;  // 測定間隔 (1秒)
const unsigned long NO_FLOW_TIMEOUT = 300000; // 無流水タイムアウト (5分)
const unsigned long LONG_USE_WARNING = 1800000; // 長時間使用警告 (30分)
const unsigned long SESSION_MAX_TIME = 3600000; // セッション最大時間 (1時間)

// ==================== グローバル変数 ====================

// Firebase関連
FirebaseData firebaseData;
FirebaseAuth auth;
FirebaseConfig config;

// センサー関連
volatile unsigned long pulseCount = 0;
unsigned long lastMeasureTime = 0;
float currentFlowRate = 0.0;

// セッション管理
struct WaterSession {
  String sessionId;
  String userId;
  String userName;
  unsigned long startTime;
  float totalAmount;
  bool isActive;
  unsigned long lastFlowTime;
  bool autoStopEnabled;
  String endReason;
} currentSession;

// 通信関連
bool wifiConnected = false;
bool firebaseConnected = false;
unsigned long lastStatusUpdate = 0;
unsigned long lastCommandCheck = 0;
unsigned long lastHeartbeat = 0;

// 時刻管理
ESP32Time rtc;

// ==================== 関数プロトタイプ ====================

// システム初期化
void initializeSystem();
void connectWiFi();
void initializeFirebase();
void setupOTA();

// センサー関連
void IRAM_ATTR pulseCounterISR();
void measureFlowRate();
float calculateFlowRate();

// セッション管理
void handleFirebaseCommands();
void startMeasurement(const JsonObject& command);
void stopMeasurement(const JsonObject& command);
void forceStopMeasurement(const JsonObject& command);
void processSession();
void handleAutoStop();

// 通信関連
void sendMeasurementData();
void updateSessionProgress();
void updateDeviceStatus();
void sendHeartbeat();

// ユーティリティ
void showStatus(const String& message, bool isError = false);
void resetSession();

// ==================== セットアップ ====================

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== AQUARIUMOTION 水使用量測定システム 起動 ===");

  // ピン初期化
  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);

  // 起動確認
  Serial.println("🚰 起動確認完了");

  // システム初期化
  initializeSystem();

  // パルスカウンター割り込み設定
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), pulseCounterISR, RISING);

  Serial.println("🚰 システム初期化完了 - 水使用量測定開始");
  showStatus("システム起動完了", false);
}

// ==================== メインループ ====================

void loop() {
  // WiFi接続確認
  if (WiFi.status() != WL_CONNECTED) {
    wifiConnected = false;
    connectWiFi();
    return;
  }
  wifiConnected = true;

  // OTA処理
  ArduinoOTA.handle();

  // Firebase コマンド確認 (2秒間隔)
  if (millis() - lastCommandCheck > 2000) {
    handleFirebaseCommands();
    lastCommandCheck = millis();
  }

  // 水流測定 (1秒間隔)
  measureFlowRate();

  // セッション処理
  processSession();

  // 自動停止チェック
  handleAutoStop();

  // デバイス状態更新 (10秒間隔)
  if (millis() - lastStatusUpdate > 10000) {
    updateDeviceStatus();
    lastStatusUpdate = millis();
  }

  // ハートビート送信 (30秒間隔)
  if (millis() - lastHeartbeat > 30000) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }

  // セッション進捗更新 (アクティブ時のみ、30秒間隔)
  if (currentSession.isActive) {
    static unsigned long lastProgressUpdate = 0;
    if (millis() - lastProgressUpdate > 30000) {
      updateSessionProgress();
      lastProgressUpdate = millis();
    }
  }

  delay(100); // 100ms間隔でループ実行
}

// ==================== システム初期化 ====================

void initializeSystem() {
  // セッション初期化
  resetSession();

  // WiFi接続
  connectWiFi();

  // Firebase初期化
  initializeFirebase();

  // OTA設定
  setupOTA();

  // 時刻同期
  configTime(9 * 3600, 0, "ntp.nict.jp", "time.google.com");

  // 初期デバイス状態送信
  updateDeviceStatus();

  Serial.println("✅ システム初期化完了");
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("WiFi接続中");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.printf("✅ WiFi接続成功: %s\n", WiFi.localIP().toString().c_str());
    wifiConnected = true;
  } else {
    Serial.println("\n❌ WiFi接続失敗");
    showStatus("WiFi接続失敗", true);
    wifiConnected = false;
  }
}

void initializeFirebase() {
  Serial.println("🔧 Firebase初期化開始...");

  config.api_key = FIREBASE_API_KEY;
  config.database_url = "https://" + String(FIREBASE_HOST);

  Serial.printf("📡 Firebase Host: %s\n", FIREBASE_HOST);
  Serial.printf("🔑 API Key設定済み: %s\n", (String(FIREBASE_API_KEY).length() > 10) ? "はい" : "いいえ");

  // 匿名認証を使用
  auth.user.email = "";
  auth.user.password = "";

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  // 認証が成功するまで待機
  Serial.print("⏳ Firebase認証中");

  unsigned long authStartTime = millis();
  while (!Firebase.ready() && millis() - authStartTime < 30000) { // 30秒タイムアウト
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (Firebase.ready()) {
    Serial.println("✅ Firebase認証成功");

    // 接続テスト
    String testPath = "/device_status/" + DEVICE_ID + "/test";

    if (Firebase.setString(firebaseData, testPath, "connected")) {
      Serial.println("✅ Firebase Realtime Database接続成功");
      firebaseConnected = true;

      // コマンドパスの初期化テスト
      String commandPath = "/device_commands/" + DEVICE_ID;
      if (Firebase.getJSON(firebaseData, commandPath)) {
        Serial.printf("✅ コマンドパス確認成功: %s\n", commandPath.c_str());
      } else {
        Serial.printf("⚠️ コマンドパス初期化: %s\n", firebaseData.errorReason().c_str());
      }

    } else {
      Serial.printf("❌ Firebase接続テスト失敗: %s\n", firebaseData.errorReason().c_str());
      firebaseConnected = false;
    }
  } else {
    Serial.printf("❌ Firebase認証タイムアウト\n");
    firebaseConnected = false;
    showStatus("Firebase認証失敗", true);
  }

  Serial.printf("🔗 Firebase接続状態: %s\n", firebaseConnected ? "接続済み" : "未接続");
}

void setupOTA() {
  ArduinoOTA.setHostname(DEVICE_ID.c_str());
  ArduinoOTA.setPassword("aquariumotion2024");

  ArduinoOTA.onStart([]() {
    String type = (ArduinoOTA.getCommand() == U_FLASH) ? "sketch" : "filesystem";
    Serial.println("OTA更新開始: " + type);
    showStatus("OTA更新中", false);
  });

  ArduinoOTA.onEnd([]() {
    Serial.println("\nOTA更新完了");
    showStatus("OTA更新完了", false);
  });

  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("進捗: %u%%\r", (progress / (total / 100)));
  });

  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("OTAエラー[%u]: ", error);
    showStatus("OTA更新エラー", true);
  });

  ArduinoOTA.begin();
  Serial.println("✅ OTA更新機能有効");
}

// ==================== センサー関連 ====================

void IRAM_ATTR pulseCounterISR() {
  pulseCount++;
  if (currentSession.isActive) {
    currentSession.lastFlowTime = millis();
  }
}

void measureFlowRate() {
  unsigned long currentTime = millis();

  if (currentTime - lastMeasureTime >= MEASURE_INTERVAL) {
    // 流量計算 (L/min)
    currentFlowRate = calculateFlowRate();

    if (currentSession.isActive) {
      // 使用量累積 (L)
      float increment = (pulseCount / PULSES_PER_LITER);
      currentSession.totalAmount += increment;

      // デバッグ出力
      if (pulseCount > 0) {
        Serial.printf("💧 流量: %.2f L/min | 累積: %.3f L | パルス: %lu\n",
                     currentFlowRate, currentSession.totalAmount, pulseCount);
      }
    }

    pulseCount = 0;
    lastMeasureTime = currentTime;
  }
}

float calculateFlowRate() {
  // YF-S201: パルス数から流量を計算
  // 流量 (L/min) = (パルス数 / パルス/L) * (60秒 / 測定間隔秒)
  return (pulseCount / PULSES_PER_LITER) * (60000.0 / MEASURE_INTERVAL);
}

// ==================== Firebase通信 ====================

void handleFirebaseCommands() {
  if (!firebaseConnected || !Firebase.ready()) {
    static unsigned long lastConnectionWarning = 0;
    if (millis() - lastConnectionWarning > 30000) { // 30秒毎に警告
      Serial.println("⚠️ Firebase未接続 - コマンド受信不可");
      lastConnectionWarning = millis();
    }
    return;
  }

  String commandPath = "/device_commands/" + DEVICE_ID;

  if (Firebase.getJSON(firebaseData, commandPath)) {
    String jsonString = firebaseData.jsonString();

    // より詳細なデバッグ出力
    Serial.printf("🔍 Firebase応答: %s\n", jsonString.c_str());

    if (firebaseData.dataType() == "json" && jsonString.length() > 4 && jsonString != "null") {
      DynamicJsonDocument doc(1024);
      DeserializationError error = deserializeJson(doc, jsonString);

      if (error) {
        Serial.printf("❌ JSON解析エラー: %s\n", error.c_str());
        return;
      }

      // デバッグ出力：受信データの詳細
      Serial.printf("🔍 受信データ詳細:\n");
      Serial.printf("  - processed: %s\n", doc["processed"].as<bool>() ? "true" : "false");
      Serial.printf("  - command存在: %s\n", doc.containsKey("command") ? "true" : "false");

      if (doc.containsKey("command")) {
        Serial.printf("  - command値: %s\n", doc["command"].as<String>().c_str());
      }

      // 処理条件の確認
      bool isProcessed = doc["processed"].as<bool>();
      bool hasCommand = doc.containsKey("command");

      if (!isProcessed && hasCommand) {
        String command = doc["command"].as<String>();

        Serial.printf("📨 コマンド受信・処理開始: %s\n", command.c_str());

        if (command == "start_measurement") {
          startMeasurement(doc.as<JsonObject>());
        } else if (command == "stop_measurement") {
          stopMeasurement(doc.as<JsonObject>());
        } else if (command == "force_stop") {
          forceStopMeasurement(doc.as<JsonObject>());
        } else {
          Serial.printf("⚠️ 未知のコマンド: %s\n", command.c_str());
        }

        // コマンドを処理済みにマーク
        if (Firebase.setString(firebaseData, commandPath + "/processed", "true")) {
          Serial.println("✅ コマンド処理済みマーク完了");
        } else {
          Serial.printf("❌ 処理済みマーク失敗: %s\n", firebaseData.errorReason().c_str());
        }
      } else {
        if (isProcessed) {
          Serial.println("🔍 コマンドは既に処理済み");
        }
        if (!hasCommand) {
          Serial.println("🔍 commandフィールドが存在しません");
        }
      }
    } else {
      Serial.printf("🔍 無効なJSON応答: dataType=%s, length=%d\n",
                   firebaseData.dataType().c_str(), jsonString.length());
    }
  } else {
    static unsigned long lastErrorLog = 0;
    if (millis() - lastErrorLog > 10000) { // 10秒毎にエラーログ
      Serial.printf("❌ Firebase取得エラー: %s\n", firebaseData.errorReason().c_str());
      lastErrorLog = millis();
    }
  }
}

// ==================== セッション管理 ====================

void startMeasurement(const JsonObject& command) {
  if (currentSession.isActive) {
    Serial.println("⚠️ 既にセッションがアクティブです - 強制終了して新規開始");
    forceStopMeasurement(command);
    delay(1000);
  }

  // 新規セッション開始
  currentSession.sessionId = command["sessionId"].as<String>();
  currentSession.userId = command["userId"].as<String>();
  currentSession.userName = command["userName"].as<String>();
  currentSession.startTime = millis();
  currentSession.totalAmount = 0.0;
  currentSession.isActive = true;
  currentSession.lastFlowTime = millis();
  currentSession.autoStopEnabled = true;
  currentSession.endReason = "";

  // センサーリセット
  pulseCount = 0;
  currentFlowRate = 0.0;

  Serial.printf("✅ 測定開始: %s (%s)\n",
               currentSession.userName.c_str(),
               currentSession.sessionId.c_str());

  showStatus("測定開始: " + currentSession.userName, false);
}

void stopMeasurement(const JsonObject& command) {
  if (!currentSession.isActive) {
    Serial.println("⚠️ アクティブなセッションがありません");
    return;
  }

  String sessionId = command["sessionId"].as<String>();
  if (sessionId != currentSession.sessionId) {
    Serial.printf("⚠️ セッションID不一致: 受信=%s, 現在=%s\n",
                 sessionId.c_str(), currentSession.sessionId.c_str());
    return;
  }

  currentSession.endReason = "manual";

  // 最終測定データ送信
  sendMeasurementData();

  Serial.printf("✅ 測定停止: %s (使用量: %.3f L)\n",
               currentSession.sessionId.c_str(),
               currentSession.totalAmount);

  showStatus("測定完了", false);

  resetSession();
}

void forceStopMeasurement(const JsonObject& command) {
  if (!currentSession.isActive) return;

  String reason = command["reason"].as<String>();
  currentSession.endReason = reason;

  Serial.printf("🛑 強制停止: %s (理由: %s)\n",
               currentSession.sessionId.c_str(),
               reason.c_str());

  // 強制停止でもデータ送信
  sendMeasurementData();

  showStatus("強制停止: " + reason, true);

  resetSession();
}

void processSession() {
  if (!currentSession.isActive) return;

  // セッション最大時間チェック
  if (millis() - currentSession.startTime > SESSION_MAX_TIME) {
    Serial.println("⏰ セッション最大時間に達しました");
    currentSession.endReason = "session_timeout";
    sendMeasurementData();
    resetSession();
    return;
  }

  // 長時間使用警告
  if (millis() - currentSession.startTime > LONG_USE_WARNING) {
    static unsigned long lastWarning = 0;
    if (millis() - lastWarning > 60000) { // 1分間隔で警告
      Serial.printf("⚠️ 長時間使用中: %.1f分\n",
                   (millis() - currentSession.startTime) / 60000.0);

      lastWarning = millis();
    }
  }
}

void handleAutoStop() {
  if (!currentSession.isActive || !currentSession.autoStopEnabled) return;

  unsigned long noFlowDuration = millis() - currentSession.lastFlowTime;

  // 無流水タイムアウト
  if (noFlowDuration > NO_FLOW_TIMEOUT) {
    Serial.printf("⏰ 無流水タイムアウト: %.1f分\n", noFlowDuration / 60000.0);

    currentSession.endReason = "no_flow_timeout";
    sendMeasurementData();

    showStatus("自動停止(無流水)", true);

    resetSession();
  }
}

void resetSession() {
  currentSession.isActive = false;
  currentSession.sessionId = "";
  currentSession.userId = "";
  currentSession.userName = "";
  currentSession.totalAmount = 0.0;
  currentSession.endReason = "";
}

// ==================== API通信 ====================

void sendMeasurementData() {
  if (!currentSession.isActive || !wifiConnected) return;

  HTTPClient http;
  http.begin(API_BASE_URL + "/api/measurement-data");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", ESP32_API_KEY);

  // 送信データ構築
  DynamicJsonDocument doc(512);
  doc["deviceId"] = DEVICE_ID;
  doc["sessionId"] = currentSession.sessionId;
  doc["totalAmount"] = round(currentSession.totalAmount * 1000) / 1000.0; // 小数点第3位まで
  doc["duration"] = (millis() - currentSession.startTime) / 1000; // 秒
  doc["endReason"] = currentSession.endReason.length() > 0 ? currentSession.endReason : "manual";

  String payload;
  serializeJson(doc, payload);

  Serial.printf("📤 測定データ送信: %.3f L\n", currentSession.totalAmount);

  int httpCode = http.POST(payload);

  if (httpCode == 200) {
    String response = http.getString();
    Serial.println("✅ 測定データ送信成功");

  } else {
    Serial.printf("❌ 測定データ送信失敗: HTTP %d\n", httpCode);
    showStatus("データ送信失敗", true);
  }

  http.end();
}

void updateSessionProgress() {
  if (!currentSession.isActive || !firebaseConnected) return;

  String statusPath = "/device_status/" + DEVICE_ID;

  DynamicJsonDocument doc(512);
  doc["deviceId"] = DEVICE_ID;
  doc["status"] = "measuring";
  doc["sessionId"] = currentSession.sessionId;
  doc["userId"] = currentSession.userId;
  doc["userName"] = currentSession.userName;
  doc["currentAmount"] = round(currentSession.totalAmount * 1000) / 1000.0;
  doc["flowRate"] = currentFlowRate;
  doc["duration"] = (millis() - currentSession.startTime) / 1000;
  doc["lastUpdate"] = rtc.getEpoch();

  String jsonString;
  serializeJson(doc, jsonString);

  Firebase.setString(firebaseData, statusPath, jsonString);
}

void updateDeviceStatus() {
  if (!firebaseConnected) return;

  String statusPath = "/device_status/" + DEVICE_ID;

  DynamicJsonDocument doc(256);
  doc["deviceId"] = DEVICE_ID;
  doc["status"] = currentSession.isActive ? "measuring" : "idle";
  doc["wifiSSID"] = WiFi.SSID();
  doc["wifiRSSI"] = WiFi.RSSI();
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["uptime"] = millis() / 1000;
  doc["lastSeen"] = rtc.getEpoch();
  doc["version"] = "1.0.0";

  String jsonString;
  serializeJson(doc, jsonString);

  Firebase.setString(firebaseData, statusPath, jsonString);
}

void sendHeartbeat() {
  if (!firebaseConnected) return;

  String heartbeatPath = "/device_heartbeat/" + DEVICE_ID;
  Firebase.setString(firebaseData, heartbeatPath, String(rtc.getEpoch()));
}

// ==================== ユーティリティ ====================

void showStatus(const String& message, bool isError) {
  Serial.printf("[%s] %s\n", isError ? "エラー" : "状態", message.c_str());
}
