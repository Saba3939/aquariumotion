/*
 * 改良版警告音システム
 * water-esp.inoの該当部分を以下で置き換えてください
 */

// ==================== 改良版警告音関数 ====================

// 基本トーン再生
void playTone(int frequency, int duration) {
  tone(BUZZER_PIN, frequency, duration);
  delay(duration);
  noTone(BUZZER_PIN);
}

// メロディック警告音（注意喚起用）
void playWarningMelody() {
  int melody[] = {880, 1047, 880, 1047};  // A5, C6, A5, C6
  int durations[] = {200, 200, 200, 200};

  for (int i = 0; i < 4; i++) {
    tone(BUZZER_PIN, melody[i], durations[i]);
    delay(durations[i] + 50);
    noTone(BUZZER_PIN);
  }
}

// 緊急警告音（段階的に音程上昇）
void playUrgentWarning() {
  for (int freq = 400; freq <= 1200; freq += 200) {
    tone(BUZZER_PIN, freq, 150);
    delay(180);
    noTone(BUZZER_PIN);
  }
}

// 短いビープ音（確認音）
void playBeep(int count = 1) {
  for (int i = 0; i < count; i++) {
    tone(BUZZER_PIN, 1000, 100);
    delay(120);
    noTone(BUZZER_PIN);
    if (i < count - 1) delay(100);
  }
}

// 低音警告（重要な警告）
void playLowWarning() {
  tone(BUZZER_PIN, 200, 500);
  delay(550);
  noTone(BUZZER_PIN);
  delay(200);
  tone(BUZZER_PIN, 200, 500);
  delay(550);
  noTone(BUZZER_PIN);
}

// サイレン音（緊急時）
void playSiren() {
  for (int i = 0; i < 3; i++) {
    // 上昇音
    for (int freq = 500; freq <= 1000; freq += 25) {
      tone(BUZZER_PIN, freq, 50);
      delay(20);
    }
    // 下降音
    for (int freq = 1000; freq >= 500; freq -= 25) {
      tone(BUZZER_PIN, freq, 50);
      delay(20);
    }
  }
  noTone(BUZZER_PIN);
}

// ==================== 使用シーン別の警告音実装 ====================

// 長時間使用警告（改良版）
void handleLongUsageWarning() {
  if (millis() - currentSession.startTime > LONG_USE_WARNING) {
    static unsigned long lastWarning = 0;
    if (millis() - lastWarning > 60000) { // 1分間隔

      float usageMinutes = (millis() - currentSession.startTime) / 60000.0;
      Serial.printf("⚠️ 長時間使用警告: %.1f分経過\n", usageMinutes);

      // 段階的警告音
      if (usageMinutes < 45) {
        playWarningMelody();  // 30-45分: メロディック警告
      } else if (usageMinutes < 55) {
        playUrgentWarning();  // 45-55分: 緊急警告
      } else {
        playSiren();          // 55分以上: サイレン
      }

      // LED点滅も連動
      blinkLED(RED_LED_PIN, usageMinutes > 45 ? 5 : 3, 200);

      lastWarning = millis();
    }
  }
}

// 無流水タイムアウト警告（段階的）
void handleNoFlowWarning() {
  if (!currentSession.isActive) return;

  unsigned long noFlowDuration = millis() - currentSession.lastFlowTime;

  // 段階的警告
  if (noFlowDuration > 240000 && noFlowDuration <= 270000) {  // 4-4.5分
    static unsigned long lastPreWarning = 0;
    if (millis() - lastPreWarning > 15000) {  // 15秒間隔
      Serial.println("⚠️ まもなく自動停止します");
      playBeep(2);  // ピピッ
      lastPreWarning = millis();
    }
  }
  else if (noFlowDuration > 270000 && noFlowDuration <= 300000) {  // 4.5-5分
    static unsigned long lastFinalWarning = 0;
    if (millis() - lastFinalWarning > 5000) {  // 5秒間隔
      Serial.println("🚨 10秒後に自動停止");
      playUrgentWarning();
      blinkLED(RED_LED_PIN, 3, 100);
      lastFinalWarning = millis();
    }
  }
  else if (noFlowDuration > NO_FLOW_TIMEOUT) {
    // 最終タイムアウト
    Serial.println("⏰ 無流水タイムアウト - 自動停止");
    playSiren();

    currentSession.endReason = "no_flow_timeout";
    sendMeasurementData();
    resetSession();
  }
}

// 開始音（改良版）
void playStartSound() {
  // 上昇メロディ
  int startMelody[] = {523, 659, 784, 1047};  // C5, E5, G5, C6
  for (int i = 0; i < 4; i++) {
    tone(BUZZER_PIN, startMelody[i], 150);
    delay(180);
    noTone(BUZZER_PIN);
  }
}

// 完了音（改良版）
void playCompleteSound() {
  // 下降メロディ
  int completeMelody[] = {1047, 784, 659, 523};  // C6, G5, E5, C5
  for (int i = 0; i < 4; i++) {
    tone(BUZZER_PIN, completeMelody[i], 200);
    delay(250);
    noTone(BUZZER_PIN);
  }
}

// エラー音（改良版）
void playErrorSound() {
  // 不協和音
  for (int i = 0; i < 5; i++) {
    tone(BUZZER_PIN, 300, 100);
    delay(50);
    tone(BUZZER_PIN, 250, 100);
    delay(100);
    noTone(BUZZER_PIN);
  }
}

// ==================== メイン関数での使用例 ====================

// startMeasurement関数内で使用
void startMeasurement(const JsonObject& command) {
  // ... 既存のコード ...

  Serial.printf("✅ 測定開始: %s (%s)\n",
               currentSession.userName.c_str(),
               currentSession.sessionId.c_str());

  showStatus("測定開始: " + currentSession.userName, false);

  // 改良版開始音
  playStartSound();

  digitalWrite(GREEN_LED_PIN, HIGH);
}

// stopMeasurement関数内で使用
void stopMeasurement(const JsonObject& command) {
  // ... 既存のコード ...

  Serial.printf("✅ 測定停止: %s (使用量: %.3f L)\n",
               currentSession.sessionId.c_str(),
               currentSession.totalAmount);

  showStatus("測定完了", false);

  // 改良版完了音
  playCompleteSound();

  resetSession();
}

// forceStopMeasurement関数内で使用
void forceStopMeasurement(const JsonObject& command) {
  // ... 既存のコード ...

  Serial.printf("🛑 強制停止: %s (理由: %s)\n",
               currentSession.sessionId.c_str(),
               reason.c_str());

  sendMeasurementData();
  showStatus("強制停止: " + reason, true);

  // 改良版エラー音
  playErrorSound();

  resetSession();
}

// processSession関数内で使用
void processSession() {
  if (!currentSession.isActive) return;

  // セッション最大時間チェック
  if (millis() - currentSession.startTime > SESSION_MAX_TIME) {
    Serial.println("⏰ セッション最大時間に達しました");
    playSiren();  // 最大時間はサイレン

    currentSession.endReason = "session_timeout";
    sendMeasurementData();
    resetSession();
    return;
  }

  // 改良版長時間使用警告
  handleLongUsageWarning();
}

// handleAutoStop関数を置き換え
void handleAutoStop() {
  handleNoFlowWarning();  // 改良版無流水警告
}

// ==================== 音量調整機能 ====================

// 音量レベル設定（PWM使用）
int volumeLevel = 5;  // 1-10 (10が最大)

void setVolume(int level) {
  volumeLevel = constrain(level, 1, 10);
}

void playToneWithVolume(int frequency, int duration) {
  // PWMで音量制御
  int pwmValue = map(volumeLevel, 1, 10, 50, 255);

  for (unsigned long start = millis(); millis() - start < duration;) {
    digitalWrite(BUZZER_PIN, HIGH);
    delayMicroseconds(500000 / frequency * pwmValue / 255);
    digitalWrite(BUZZER_PIN, LOW);
    delayMicroseconds(500000 / frequency * (255 - pwmValue) / 255);
  }
}

// ==================== 時間帯別音量調整 ====================

void adjustVolumeByTime() {
  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    int hour = timeinfo.tm_hour;

    // 夜間は音量を下げる
    if (hour >= 22 || hour <= 6) {
      setVolume(3);  // 夜間: 低音量
    } else if (hour >= 7 && hour <= 21) {
      setVolume(7);  // 日中: 通常音量
    } else {
      setVolume(5);  // その他: 中音量
    }
  }
}