/* 使用していない
 * AQUARIUMOTION 水使用量測定システム - ESP32軽量版
 *
 * 軽量化のポイント:
 * - FirebaseESP32ライブラリを使用せず、HTTP APIのみ
 * - OTA機能を削除
 * - 最小限の機能に絞り込み
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ==================== 設定 ====================

// WiFi設定
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// API設定
const String API_BASE_URL = "https://aquariumotion-nextjs.vercel.app";
const String ESP32_API_KEY = "your-esp32-api-key";

// デバイス設定
const String DEVICE_ID = "water_device_001";

// ピン設定
const int FLOW_SENSOR_PIN = 2;

// センサー設定
const float PULSES_PER_LITER = 450.0;
const unsigned long MEASURE_INTERVAL = 1000;
const unsigned long NO_FLOW_TIMEOUT = 300000; // 5分
const unsigned long SESSION_MAX_TIME = 3600000; // 1時間

// ==================== グローバル変数 ====================

// センサー関連
volatile unsigned long pulseCount = 0;
unsigned long lastMeasureTime = 0;

// セッション管理
struct WaterSession {
  String sessionId;
  String userId;
  String userName;
  unsigned long startTime;
  float totalAmount;
  bool isActive;
  unsigned long lastFlowTime;
  String endReason;
} currentSession;

// 通信関連
unsigned long lastCommandCheck = 0;
unsigned long lastStatusUpdate = 0;

// ==================== 関数 ====================

void IRAM_ATTR pulseCounterISR() {
  pulseCount++;
  if (currentSession.isActive) {
    currentSession.lastFlowTime = millis();
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== AQUARIUMOTION 水測定システム 軽量版 ===");

  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), pulseCounterISR, RISING);

  resetSession();
  connectWiFi();

  Serial.println("🚰 システム起動完了");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    return;
  }

  // コマンド確認 (3秒間隔)
  if (millis() - lastCommandCheck > 3000) {
    checkForCommands();
    lastCommandCheck = millis();
  }

  // 水流測定
  measureFlow();

  // セッション処理
  processSession();

  // 状態更新 (30秒間隔)
  if (millis() - lastStatusUpdate > 30000) {
    updateStatus();
    lastStatusUpdate = millis();
  }

  delay(100);
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("WiFi接続中");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n✅ WiFi接続: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n❌ WiFi接続失敗");
  }
}

void measureFlow() {
  unsigned long currentTime = millis();

  if (currentTime - lastMeasureTime >= MEASURE_INTERVAL) {
    if (currentSession.isActive && pulseCount > 0) {
      float increment = pulseCount / PULSES_PER_LITER;
      currentSession.totalAmount += increment;

      float flowRate = (pulseCount / PULSES_PER_LITER) * (60000.0 / MEASURE_INTERVAL);
      Serial.printf("💧 流量: %.2f L/min | 累積: %.3f L\n", flowRate, currentSession.totalAmount);
    }

    pulseCount = 0;
    lastMeasureTime = currentTime;
  }
}

void processSession() {
  if (!currentSession.isActive) return;

  // セッション最大時間チェック
  if (millis() - currentSession.startTime > SESSION_MAX_TIME) {
    Serial.println("⏰ セッション最大時間");
    currentSession.endReason = "session_timeout";
    endSession();
    return;
  }

  // 無流水タイムアウト
  if (millis() - currentSession.lastFlowTime > NO_FLOW_TIMEOUT) {
    Serial.println("⏰ 無流水タイムアウト");
    currentSession.endReason = "no_flow_timeout";
    endSession();
  }
}

void checkForCommands() {
  HTTPClient http;
  http.begin(API_BASE_URL + "/api/device-command?deviceId=" + DEVICE_ID);
  http.addHeader("x-api-key", ESP32_API_KEY);

  int httpCode = http.GET();
  if (httpCode == 200) {
    String response = http.getString();
    DynamicJsonDocument doc(512);

    if (deserializeJson(doc, response) == DeserializationError::Ok) {
      String command = doc["command"].as<String>();

      if (command == "start_measurement") {
        startMeasurement(doc);
      } else if (command == "stop_measurement") {
        stopMeasurement();
      } else if (command == "force_stop") {
        forceStop(doc["reason"].as<String>());
      }
    }
  }
  http.end();
}

void startMeasurement(const JsonDocument& doc) {
  if (currentSession.isActive) {
    Serial.println("⚠️ セッション強制終了");
    endSession();
  }

  currentSession.sessionId = doc["sessionId"].as<String>();
  currentSession.userId = doc["userId"].as<String>();
  currentSession.userName = doc["userName"].as<String>();
  currentSession.startTime = millis();
  currentSession.totalAmount = 0.0;
  currentSession.isActive = true;
  currentSession.lastFlowTime = millis();
  currentSession.endReason = "";

  pulseCount = 0;

  Serial.printf("✅ 測定開始: %s\n", currentSession.userName.c_str());
}

void stopMeasurement() {
  if (!currentSession.isActive) return;

  currentSession.endReason = "manual";
  endSession();
  Serial.println("✅ 測定停止");
}

void forceStop(const String& reason) {
  if (!currentSession.isActive) return;

  currentSession.endReason = reason;
  endSession();
  Serial.printf("🛑 強制停止: %s\n", reason.c_str());
}

void endSession() {
  if (!currentSession.isActive) return;

  // データ送信
  sendMeasurementData();
  resetSession();
}

void sendMeasurementData() {
  HTTPClient http;
  http.begin(API_BASE_URL + "/api/measurement-data");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", ESP32_API_KEY);

  DynamicJsonDocument doc(256);
  doc["deviceId"] = DEVICE_ID;
  doc["sessionId"] = currentSession.sessionId;
  doc["totalAmount"] = round(currentSession.totalAmount * 1000) / 1000.0;
  doc["duration"] = (millis() - currentSession.startTime) / 1000;
  doc["endReason"] = currentSession.endReason;

  String payload;
  serializeJson(doc, payload);

  int httpCode = http.POST(payload);

  if (httpCode == 200) {
    Serial.printf("✅ データ送信成功: %.3f L\n", currentSession.totalAmount);
  } else {
    Serial.printf("❌ データ送信失敗: %d\n", httpCode);
  }

  http.end();
}

void updateStatus() {
  HTTPClient http;
  http.begin(API_BASE_URL + "/api/device-status");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", ESP32_API_KEY);

  DynamicJsonDocument doc(256);
  doc["deviceId"] = DEVICE_ID;
  doc["status"] = currentSession.isActive ? "measuring" : "idle";
  doc["wifiRSSI"] = WiFi.RSSI();
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["uptime"] = millis() / 1000;

  String payload;
  serializeJson(doc, payload);

  http.POST(payload);
  http.end();
}

void resetSession() {
  currentSession.isActive = false;
  currentSession.sessionId = "";
  currentSession.userId = "";
  currentSession.userName = "";
  currentSession.totalAmount = 0.0;
  currentSession.endReason = "";
}
