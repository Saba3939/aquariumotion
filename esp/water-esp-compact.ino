/*
 * AQUARIUMOTION 水使用量測定システム - 最適化版
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <FirebaseESP32.h>
#include <ESP32Time.h>

// ==================== 設定 ====================
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

#define FIREBASE_HOST "aquariumotion-default-rtdb.firebaseio.com"
#define FIREBASE_API_KEY "your-firebase-web-api-key"

const String API_BASE_URL = "https://aquariumotion-nextjs.vercel.app";
const String ESP32_API_KEY = "your-esp32-api-key";
const String DEVICE_ID = "water_device_001";

const int FLOW_SENSOR_PIN = 2;
const float PULSES_PER_LITER = 450.0;
const unsigned long MEASURE_INTERVAL = 1000;
const unsigned long NO_FLOW_TIMEOUT = 300000;
const unsigned long SESSION_MAX_TIME = 3600000;

// ==================== グローバル変数 ====================
FirebaseData firebaseData;
FirebaseAuth auth;
FirebaseConfig config;

volatile unsigned long pulseCount = 0;
unsigned long lastMeasureTime = 0;
float currentFlowRate = 0.0;

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

bool wifiConnected = false;
bool firebaseConnected = false;
unsigned long lastStatusUpdate = 0;
unsigned long lastCommandCheck = 0;
ESP32Time rtc;

// ==================== 関数プロトタイプ ====================
void IRAM_ATTR pulseCounterISR();

// ==================== セットアップ ====================
void setup() {
  Serial.begin(115200);
  Serial.println("🚰 AQUARIUMOTION 水測定システム起動");

  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  resetSession();
  connectWiFi();
  initializeFirebase();

  configTime(9 * 3600, 0, "ntp.nict.jp");
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), pulseCounterISR, RISING);

  Serial.println("✅ システム初期化完了");
}

// ==================== メインループ ====================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    wifiConnected = false;
    connectWiFi();
    return;
  }
  wifiConnected = true;

  if (millis() - lastCommandCheck > 2000) {
    handleFirebaseCommands();
    lastCommandCheck = millis();
  }

  measureFlowRate();
  processSession();
  handleAutoStop();

  if (millis() - lastStatusUpdate > 30000) {
    updateDeviceStatus();
    lastStatusUpdate = millis();
  }

  delay(100);
}

// ==================== WiFi・Firebase ====================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("✅ WiFi接続: %s\n", WiFi.localIP().toString().c_str());
    wifiConnected = true;
  } else {
    Serial.println("❌ WiFi接続失敗");
    wifiConnected = false;
  }
}

void initializeFirebase() {
  config.api_key = FIREBASE_API_KEY;
  config.database_url = "https://" + String(FIREBASE_HOST);

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  unsigned long authStart = millis();
  while (!Firebase.ready() && millis() - authStart < 30000) {
    delay(500);
  }

  if (Firebase.ready()) {
    String testPath = "/device_status/" + DEVICE_ID + "/test";
    if (Firebase.setString(firebaseData, testPath, "connected")) {
      Serial.println("✅ Firebase接続成功");
      firebaseConnected = true;
    } else {
      Serial.println("❌ Firebase接続失敗");
      firebaseConnected = false;
    }
  } else {
    Serial.println("❌ Firebase認証失敗");
    firebaseConnected = false;
  }
}

// ==================== Firebase通信 ====================
void handleFirebaseCommands() {
  if (!firebaseConnected || !Firebase.ready()) return;

  String commandPath = "/device_commands/" + DEVICE_ID;

  if (Firebase.getJSON(firebaseData, commandPath)) {
    String jsonString = firebaseData.jsonString();

    if (jsonString.length() > 4 && jsonString != "null") {
      DynamicJsonDocument doc(1024);
      if (deserializeJson(doc, jsonString) == DeserializationError::Ok) {

        bool isProcessed = doc["processed"].as<bool>();
        bool hasCommand = doc.containsKey("command");

        if (!isProcessed && hasCommand) {
          String command = doc["command"].as<String>();
          Serial.printf("📨 コマンド受信: %s\n", command.c_str());

          if (command == "start_measurement") {
            startMeasurement(doc.as<JsonObject>());
          } else if (command == "stop_measurement") {
            stopMeasurement(doc.as<JsonObject>());
          } else if (command == "force_stop") {
            forceStopMeasurement(doc.as<JsonObject>());
          }

          Firebase.setString(firebaseData, commandPath + "/processed", "true");
        }
      }
    }
  }
}

// ==================== センサー関連 ====================
void IRAM_ATTR pulseCounterISR() {
  pulseCount++;
  if (currentSession.isActive) {
    currentSession.lastFlowTime = millis();
  }
}

void measureFlowRate() {
  if (millis() - lastMeasureTime >= MEASURE_INTERVAL) {
    currentFlowRate = (pulseCount / PULSES_PER_LITER) * (60000.0 / MEASURE_INTERVAL);

    if (currentSession.isActive) {
      float increment = (pulseCount / PULSES_PER_LITER);
      currentSession.totalAmount += increment;

      if (pulseCount > 0) {
        Serial.printf("💧 流量: %.2f L/min | 累積: %.3f L\n", currentFlowRate, currentSession.totalAmount);
      }
    }

    pulseCount = 0;
    lastMeasureTime = millis();
  }
}

// ==================== セッション管理 ====================
void startMeasurement(const JsonObject& command) {
  if (currentSession.isActive) {
    forceStopMeasurement(command);
    delay(1000);
  }

  currentSession.sessionId = command["sessionId"].as<String>();
  currentSession.userId = command["userId"].as<String>();
  currentSession.userName = command["userName"].as<String>();
  currentSession.startTime = millis();
  currentSession.totalAmount = 0.0;
  currentSession.isActive = true;
  currentSession.lastFlowTime = millis();
  currentSession.endReason = "";

  pulseCount = 0;
  currentFlowRate = 0.0;

  Serial.printf("✅ 測定開始: %s\n", currentSession.userName.c_str());
}

void stopMeasurement(const JsonObject& command) {
  if (!currentSession.isActive) return;

  String sessionId = command["sessionId"].as<String>();
  if (sessionId != currentSession.sessionId) return;

  currentSession.endReason = "manual";
  sendMeasurementData();

  Serial.printf("✅ 測定停止: %.3f L\n", currentSession.totalAmount);
  resetSession();
}

void forceStopMeasurement(const JsonObject& command) {
  if (!currentSession.isActive) return;

  currentSession.endReason = command["reason"].as<String>();
  sendMeasurementData();

  Serial.printf("🛑 強制停止: %s\n", currentSession.endReason.c_str());
  resetSession();
}

void processSession() {
  if (!currentSession.isActive) return;

  if (millis() - currentSession.startTime > SESSION_MAX_TIME) {
    currentSession.endReason = "session_timeout";
    sendMeasurementData();
    resetSession();
  }
}

void handleAutoStop() {
  if (!currentSession.isActive) return;

  if (millis() - currentSession.lastFlowTime > NO_FLOW_TIMEOUT) {
    currentSession.endReason = "no_flow_timeout";
    sendMeasurementData();
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

  DynamicJsonDocument doc(512);
  doc["deviceId"] = DEVICE_ID;
  doc["sessionId"] = currentSession.sessionId;
  doc["totalAmount"] = round(currentSession.totalAmount * 1000) / 1000.0;
  doc["duration"] = (millis() - currentSession.startTime) / 1000;
  doc["endReason"] = currentSession.endReason.length() > 0 ? currentSession.endReason : "manual";

  String payload;
  serializeJson(doc, payload);

  int httpCode = http.POST(payload);
  if (httpCode == 200) {
    Serial.println("✅ データ送信成功");
  } else {
    Serial.printf("❌ データ送信失敗: %d\n", httpCode);
  }

  http.end();
}

void updateDeviceStatus() {
  if (!firebaseConnected) return;

  String statusPath = "/device_status/" + DEVICE_ID;

  DynamicJsonDocument doc(256);
  doc["deviceId"] = DEVICE_ID;
  doc["status"] = currentSession.isActive ? "measuring" : "idle";
  doc["uptime"] = millis() / 1000;
  doc["lastSeen"] = rtc.getEpoch();

  String jsonString;
  serializeJson(doc, jsonString);

  Firebase.setString(firebaseData, statusPath, jsonString);
}