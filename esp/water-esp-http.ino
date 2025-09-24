/*
 * AQUARIUMOTION 水測定 - HTTP版 + PCNT
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <sys/time.h>
#include "driver/pcnt.h"

// 設定
const char* ssid = "YOUR_WIFI_SSID";
const char* pass = "YOUR_WIFI_PASSWORD";
const char* base_url = "https://aquariumotion-nextjs.vercel.app";
const char* api_key = "your-esp32-api-key";
const char* device_id = "water_device_001";

// PCNT設定
#define PULSE_INPUT_PIN 4
#define PCNT_UNIT PCNT_UNIT_0
#define MEASURE_INTERVAL 100
#define WATER_CONVERSION 7.5
#define WATER_UNUSED_TIME_LIMIT 60000 // 60秒（1分間の無流水でタイムアウト）

// 変数
float amountOfWater = 0;
float total = 0;
bool active = false;
String sid = "";
unsigned long start = 0;
unsigned long lastCheck = 0;
unsigned long lastFlow = 0;
unsigned long lastMeasureTime = 0;
unsigned long lastWaterUsedTime = 0;

void setup() {
  Serial.begin(115200);

  // PCNT設定
  pcnt_config_t pcnt_config;
  pcnt_config.pulse_gpio_num = PULSE_INPUT_PIN;
  pcnt_config.ctrl_gpio_num = PCNT_PIN_NOT_USED;
  pcnt_config.channel = PCNT_CHANNEL_0;
  pcnt_config.unit = PCNT_UNIT;
  pcnt_config.pos_mode = PCNT_COUNT_INC;
  pcnt_config.neg_mode = PCNT_COUNT_DIS;
  pcnt_config.lctrl_mode = PCNT_MODE_KEEP;
  pcnt_config.hctrl_mode = PCNT_MODE_KEEP;
  pcnt_config.counter_h_lim = 32767;
  pcnt_config.counter_l_lim = -32768;

  pcnt_unit_config(&pcnt_config);
  pcnt_set_filter_value(PCNT_UNIT, 100);
  pcnt_filter_enable(PCNT_UNIT);
  pcnt_counter_pause(PCNT_UNIT);
  pcnt_counter_clear(PCNT_UNIT);
  pcnt_counter_resume(PCNT_UNIT);

  WiFi.begin(ssid, pass);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nReady");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(5000);
    return;
  }

  unsigned long currentTime = millis();

  // API経由でコマンドチェック (5秒間隔)
  if (currentTime - lastCheck > 5000) {
    checkCommand();
    lastCheck = currentTime;
  }

  // PCNT水量測定
  if (currentTime - lastMeasureTime >= MEASURE_INTERVAL) {
    lastMeasureTime = currentTime;

    // カウンタ値を取得
    int16_t pulseCount = 0;
    pcnt_get_counter_value(PCNT_UNIT, &pulseCount);

    // 周波数を計算
    float frequency = (float)pulseCount / (MEASURE_INTERVAL / 1000.0);

    // カウンタをクリア
    pcnt_counter_clear(PCNT_UNIT);

    // 水量計算
    float Q = frequency / WATER_CONVERSION;
    amountOfWater += (1.0/60) * Q * (MEASURE_INTERVAL/1000.0);

    if (frequency != 0) {
      lastWaterUsedTime = currentTime;
      lastFlow = currentTime; // アクティブセッション用
      if (active) {
        Serial.printf("Water flow detected! Frequency: %.2f Hz\n", frequency);
      }
    }

    // アクティブセッション中は累積
    if (active) {
      total = amountOfWater;
      if (frequency > 0) {
        Serial.printf("Session active - Total: %.3f L\n", total);
      }

      // セッション状態をデバッグ出力（10秒間隔）
      static unsigned long lastDebug = 0;
      if (currentTime - lastDebug > 10000) {
        Serial.printf("Session status: Active=true, Time since start: %lu s, Time since last flow: %lu s\n",
                     (currentTime - start)/1000, (currentTime - lastFlow)/1000);
        lastDebug = currentTime;
      }
    }
  }

  // 水使用終了検知（非アクティブ時）
  if (!active && currentTime - lastWaterUsedTime > WATER_UNUSED_TIME_LIMIT && amountOfWater != 0) {
    Serial.println("----------");
    Serial.println("USED WATER");
    Serial.println(amountOfWater);
    Serial.println("[L]");
    Serial.println("----------");

    amountOfWater = 0;
    delay(1000);
  }

  // アクティブセッション自動停止（水流が止まってから1分後）
  if (active && currentTime - lastFlow > WATER_UNUSED_TIME_LIMIT && lastFlow > start) {
    Serial.println("Session timeout - sending data and ending session");
    sendData("timeout");

    // セッション状態を完全にリセット
    active = false;
    sid = "";
    total = 0;
    amountOfWater = 0;

    Serial.println("Session completely reset - ready for new session");
  }

  delay(50);
}

void checkCommand() {
  HTTPClient http;
  http.begin(String(base_url) + "/api/device-command?deviceId=" + device_id);
  http.addHeader("x-api-key", api_key);

  int code = http.GET();
  if (code == 200) {
    String response = http.getString();
    StaticJsonDocument<256> doc;

    if (deserializeJson(doc, response) == DeserializationError::Ok) {
      if (doc["hasCommand"]) {
        String cmd = doc["command"];

        if (cmd == "start_measurement") {
          sid = doc["sessionId"].as<String>();
          active = true;
          start = millis();
          total = 0;
          amountOfWater = 0; // PCNT水量リセット
          lastFlow = start; // 開始時刻に設定
          lastWaterUsedTime = start;
          // PCNTカウンタもリセット
          pcnt_counter_clear(PCNT_UNIT);
          Serial.println("Session started - waiting for water flow");
        }
        else if (cmd.indexOf("stop") >= 0 || cmd == "force_stop") {
          if (active) {
            sendData(cmd == "force_stop" ? "force_stop" : "manual");
            Serial.printf("Session ended by command: %s\n", cmd.c_str());
          } else {
            Serial.println("Stop command received but no active session");
          }
          // セッション状態を確実にリセット
          active = false;
          sid = "";
          total = 0;
          amountOfWater = 0;
        }
      }
    }
  }
  http.end();
}

void sendData(const char* reason) {
  if (sid.length() == 0) {
    Serial.println("Warning: Attempting to send data without valid session ID");
    return;
  }

  HTTPClient http;
  http.begin(String(base_url) + "/api/measurement-data");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", api_key);

  StaticJsonDocument<128> doc;
  doc["deviceId"] = device_id;
  doc["sessionId"] = sid;
  doc["totalAmount"] = (int)(total * 1000) / 1000.0;
  doc["duration"] = (millis() - start) / 1000;
  doc["endReason"] = reason;

  String payload;
  serializeJson(doc, payload);

  Serial.printf("Sending session data: Session=%s, Amount=%.3fL, Reason=%s\n",
                sid.c_str(), total, reason);

  int code = http.POST(payload);
  Serial.printf("Data sent with status: %d\n", code);
  http.end();
}