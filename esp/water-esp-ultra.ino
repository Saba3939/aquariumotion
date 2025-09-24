/*
 * AQUARIUMOTION 水測定 - 超軽量版
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <FirebaseESP32.h>

// 設定
const char* ssid = "YOUR_WIFI_SSID";
const char* pass = "YOUR_WIFI_PASSWORD";
#define FB_HOST "aquariumotion-default-rtdb.firebaseio.com"
#define FB_KEY "your-firebase-web-api-key"
const char* api_url = "https://aquariumotion-nextjs.vercel.app/api/measurement-data";
const char* api_key = "your-esp32-api-key";
const char* device_id = "water_device_001";

// 変数
FirebaseData fd;
FirebaseAuth fa;
FirebaseConfig fc;
volatile unsigned long pc = 0;
float total = 0;
bool active = false;
String sid = "";
unsigned long start = 0;
unsigned long lastCmd = 0;
unsigned long lastFlow = 0;

void IRAM_ATTR pulse() {
  pc++;
  lastFlow = millis();
}

void setup() {
  Serial.begin(115200);
  pinMode(2, INPUT_PULLUP);
  attachInterrupt(0, pulse, RISING);

  WiFi.begin(ssid, pass);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  fc.api_key = FB_KEY;
  fc.database_url = "https://" + String(FB_HOST);
  Firebase.begin(&fc, &fa);

  Serial.println("Ready");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(5000);
    return;
  }

  // コマンドチェック (3秒間隔)
  if (millis() - lastCmd > 3000) {
    if (Firebase.ready()) {
      String path = "/device_commands/" + String(device_id);
      if (Firebase.getJSON(fd, path)) {
        String json = fd.jsonString();
        if (json.length() > 4) {
          StaticJsonDocument<256> doc;
          if (deserializeJson(doc, json) == DeserializationError::Ok) {
            if (!doc["processed"] && doc["command"]) {
              String cmd = doc["command"];
              if (cmd == "start_measurement") {
                sid = doc["sessionId"].as<String>();
                active = true;
                start = millis();
                total = 0;
                lastFlow = millis();
                pc = 0;
              } else if (cmd.indexOf("stop") >= 0) {
                if (active) sendData();
                active = false;
                sid = "";
              }
              Firebase.setString(fd, path + "/processed", "true");
            }
          }
        }
      }
    }
    lastCmd = millis();
  }

  // 測定 (1秒間隔)
  static unsigned long lastMeasure = 0;
  if (millis() - lastMeasure >= 1000) {
    if (active && pc > 0) {
      total += pc / 450.0;
      pc = 0;
    }
    lastMeasure = millis();
  }

  // 自動停止 (5分無流水)
  if (active && millis() - lastFlow > 300000) {
    sendData();
    active = false;
    sid = "";
  }

  delay(100);
}

void sendData() {
  HTTPClient http;
  http.begin(api_url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", api_key);

  StaticJsonDocument<128> doc;
  doc["deviceId"] = device_id;
  doc["sessionId"] = sid;
  doc["totalAmount"] = (int)(total * 1000) / 1000.0;
  doc["duration"] = (millis() - start) / 1000;
  doc["endReason"] = "auto";

  String payload;
  serializeJson(doc, payload);
  http.POST(payload);
  http.end();
}