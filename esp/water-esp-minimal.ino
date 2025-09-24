/*
 * AQUARIUMOTION 水測定システム - 最小版
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <FirebaseESP32.h>

// 設定
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
#define FIREBASE_HOST "aquariumotion-default-rtdb.firebaseio.com"
#define FIREBASE_API_KEY "your-firebase-web-api-key"
const String API_BASE_URL = "https://aquariumotion-nextjs.vercel.app";
const String ESP32_API_KEY = "your-esp32-api-key";
const String DEVICE_ID = "water_device_001";

const int FLOW_SENSOR_PIN = 2;
const float PULSES_PER_LITER = 450.0;

// グローバル変数
FirebaseData firebaseData;
FirebaseAuth auth;
FirebaseConfig config;

volatile unsigned long pulseCount = 0;
unsigned long lastMeasure = 0;
float totalAmount = 0.0;
bool sessionActive = false;
String sessionId = "";
String userId = "";
unsigned long sessionStart = 0;
unsigned long lastFlow = 0;
unsigned long lastCommandCheck = 0;

void IRAM_ATTR pulseISR() {
  pulseCount++;
  lastFlow = millis();
}

void setup() {
  Serial.begin(115200);
  Serial.println("AQUARIUMOTION 起動");

  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), pulseISR, RISING);

  // WiFi接続
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("WiFi接続完了");

  // Firebase初期化
  config.api_key = FIREBASE_API_KEY;
  config.database_url = "https://" + String(FIREBASE_HOST);
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  Serial.println("システム準備完了");
}

void loop() {
  // WiFi再接続
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(5000);
    return;
  }

  // コマンドチェック
  if (millis() - lastCommandCheck > 2000) {
    checkCommands();
    lastCommandCheck = millis();
  }

  // 流量測定
  if (millis() - lastMeasure >= 1000) {
    measureFlow();
    lastMeasure = millis();
  }

  // 自動停止
  if (sessionActive && millis() - lastFlow > 300000) {
    stopSession("timeout");
  }

  delay(100);
}

void checkCommands() {
  if (!Firebase.ready()) return;

  String path = "/device_commands/" + DEVICE_ID;
  if (Firebase.getJSON(firebaseData, path)) {
    String json = firebaseData.jsonString();
    if (json.length() > 4 && json != "null") {
      DynamicJsonDocument doc(512);
      if (deserializeJson(doc, json) == DeserializationError::Ok) {
        if (!doc["processed"].as<bool>() && doc.containsKey("command")) {
          String cmd = doc["command"];
          Serial.println("コマンド: " + cmd);

          if (cmd == "start_measurement") {
            startSession(doc["sessionId"], doc["userId"]);
          } else if (cmd == "stop_measurement" || cmd == "force_stop") {
            stopSession("manual");
          }

          Firebase.setString(firebaseData, path + "/processed", "true");
        }
      }
    }
  }
}

void measureFlow() {
  if (sessionActive && pulseCount > 0) {
    totalAmount += pulseCount / PULSES_PER_LITER;
    Serial.printf("累積: %.3f L\n", totalAmount);
    pulseCount = 0;
  }
}

void startSession(String sid, String uid) {
  sessionId = sid;
  userId = uid;
  sessionActive = true;
  sessionStart = millis();
  totalAmount = 0;
  lastFlow = millis();
  pulseCount = 0;
  Serial.println("測定開始");
}

void stopSession(String reason) {
  if (!sessionActive) return;

  sessionActive = false;
  sendData(reason);
  Serial.println("測定終了");

  sessionId = "";
  userId = "";
  totalAmount = 0;
}

void sendData(String reason) {
  HTTPClient http;
  http.begin(API_BASE_URL + "/api/measurement-data");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", ESP32_API_KEY);

  DynamicJsonDocument doc(256);
  doc["deviceId"] = DEVICE_ID;
  doc["sessionId"] = sessionId;
  doc["totalAmount"] = round(totalAmount * 1000) / 1000.0;
  doc["duration"] = (millis() - sessionStart) / 1000;
  doc["endReason"] = reason;

  String payload;
  serializeJson(doc, payload);

  int code = http.POST(payload);
  Serial.printf("送信結果: %d\n", code);
  http.end();
}