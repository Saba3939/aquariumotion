# ESP32 デプロイ設定ガイド（シンプル版）

## 🎯 **特徴**
- **シンプル設計**: LED・ブザーなし、シリアル出力のみ
- **軽量動作**: 最小限のハードウェア要件
- **信頼性重視**: 余分な機能を排除した安定動作

## 🚀 デプロイ前の設定変更

`water-esp.ino` ファイルの以下の部分を実際の値に置き換えてください。

### 1. WiFi設定

```cpp
// WiFi設定
const char* WIFI_SSID = "実際のWiFi名";
const char* WIFI_PASSWORD = "実際のWiFiパスワード";
```

**例:**
```cpp
const char* WIFI_SSID = "MyHomeWiFi";
const char* WIFI_PASSWORD = "mypassword123";
```

### 2. Firebase設定

```cpp
// Firebase設定
#define FIREBASE_HOST "aquariumotion-default-rtdb.firebaseio.com"
#define FIREBASE_API_KEY "実際のFirebase Web API Key"
#define FIREBASE_PROJECT_ID "aquariumotion"
```

**Firebase Web API Keyの取得方法:**
1. Firebase Console → プロジェクト設定（歯車アイコン）
2. 一般 タブ
3. マイアプリ セクションで Webアプリを選択
4. **Web API Key** をコピー

**例:**
```cpp
#define FIREBASE_API_KEY "AIzaSyD1234567890abcdefghijklmnopqrstuvw"
```

### 3. API設定

```cpp
// AQUARIUMOTION API設定
const String API_BASE_URL = "https://aquariumotion-nextjs.vercel.app";
const String ESP32_API_KEY = "実際のAPI_KEY";
```

**ESP32_API_KEYの確認方法:**
- Vercelの環境変数 `ESP32_API_KEY` の値を使用
- または新しいAPIキーを生成

### 4. デバイスID設定

```cpp
// デバイス設定
const String DEVICE_ID = "water_device_001";  // 必要に応じて変更
```

複数デバイスがある場合は、各デバイスに異なるIDを設定：
- `water_device_001`
- `water_device_002`
- など

## 🔧 Arduino IDE設定

### 必要ライブラリ

以下のライブラリをArduino IDEにインストール：

```
1. ESP32 Board Package
   - Arduino IDE → ボードマネージャ → ESP32 by Espressif Systems

2. FirebaseESP32
   - ライブラリマネージャ → "FirebaseESP32" by Mobizt

3. ArduinoJson
   - ライブラリマネージャ → "ArduinoJson" by Benoit Blanchon

4. ESP32Time
   - ライブラリマネージャ → "ESP32Time" by Felix Biego
```

### ボード設定

```
ボード: ESP32 Dev Module
アップロード速度: 921600
フラッシュ周波数: 80MHz
フラッシュモード: DIO
フラッシュサイズ: 4MB (32Mb)
分割方式: Default 4MB with spiffs
```

## 📡 接続確認

### 1. シリアルモニター出力例

正常に動作している場合の出力例：

```
=== AQUARIUMOTION 水使用量測定システム 起動 ===
🚰 起動確認完了
WiFi接続中.....
✅ WiFi接続成功: 192.168.1.100
✅ Firebase接続成功
✅ OTA更新機能有効
✅ システム初期化完了
🚰 システム初期化完了 - 水使用量測定開始
```

### 2. 動作確認（シリアル出力のみ）

シリアルモニター（115200 baud）で以下の出力を確認：

- **起動時**: "🚰 起動確認完了"
- **WiFi接続中**: "WiFi接続中....."
- **WiFi接続成功**: "✅ WiFi接続成功: 192.168.1.XXX"
- **測定開始**: "✅ 測定開始: ユーザー名"
- **測定中**: "💧 流量: X.XX L/min | 累積: X.XXX L"
- **測定完了**: "✅ 測定データ送信成功"

### 3. Firebase接続確認

Firebase Realtime Database → データ → `device_status/水デバイスID` に以下が表示される：

```json
{
  "deviceId": "water_device_001",
  "status": "idle",
  "uptime": 123,
  "wifiRSSI": -45,
  "lastSeen": 1703123456,
  "version": "1.0.0"
}
```

## 🐛 トラブルシューティング

### WiFi接続失敗

**症状**: WiFi接続中の点滅が続く
**解決**:
- SSID/パスワードの確認
- WiFiの電波強度確認
- ルーターの2.4GHz帯確認

### Firebase接続失敗

**症状**: "Firebase接続失敗" メッセージ
**解決**:
- FIREBASE_HOSTの確認
- FIREBASE_AUTHの確認
- Firebaseルールの確認

### API通信失敗

**症状**: 測定データ送信失敗
**解決**:
- API_KEYの確認
- API_BASE_URLの確認
- インターネット接続確認

## 🔄 OTA更新

デプロイ後、Arduino IDEからワイヤレス更新が可能：

1. Arduino IDE → ツール → ポート
2. ネットワークポートに "水デバイスID" が表示
3. 選択してプログラム書き込み

**OTAパスワード**: `aquariumotion2024`

## 📊 監視とメンテナンス

### リアルタイム監視

Firebase Console → Realtime Database でリアルタイム状態確認：

- デバイス稼働状況
- WiFi信号強度
- メモリ使用量
- 稼働時間

### ログ確認

シリアルモニター（115200 baud）でリアルタイムログ確認：

```
💧 流量: 2.50 L/min | 累積: 0.125 L | パルス: 56
📨 コマンド受信: start_measurement
✅ 測定開始: ユーザー名 (session_abc123)
📤 測定データ送信: 2.450 L
✅ 測定データ送信成功
```

## 🔒 セキュリティ

### 重要事項

1. **API KEYの管理**
   - 外部に漏洩させない
   - 定期的にローテーション

2. **WiFiセキュリティ**
   - WPA2以上の暗号化
   - 強固なパスワード

3. **Firebase設定**
   - 適切なセキュリティルール
   - 不要なアクセス権限の削除

4. **物理セキュリティ**
   - デバイスの物理的保護
   - 不正アクセス防止

## 🔌 **必要な配線（最小構成）**

```
YF-S201水流センサー → ESP32
赤線 (VCC) → 5V
黒線 (GND) → GND
黄線 (Signal) → GPIO 2
```

**注意**: LEDやブザーの配線は不要です。

## ✅ デプロイ完了チェックリスト

- [ ] WiFi設定変更済み
- [ ] Firebase設定変更済み
- [ ] API_KEY設定変更済み
- [ ] 必要ライブラリインストール済み
- [ ] 水流センサーのみ配線完了（GPIO 2）
- [ ] ESP32にプログラム書き込み完了
- [ ] シリアルモニターで正常起動確認
- [ ] Firebase Database更新確認
- [ ] ICカードでのテスト動作確認
- [ ] 水流センサーでのテスト動作確認
- [ ] API連携テスト完了

**🎉 シンプル版水使用量測定システムのデプロイ完了！**

### 📊 **監視方法**
- **リアルタイム**: シリアルモニター（115200 baud）
- **デバイス状態**: Firebase Realtime Database
- **使用量データ**: AQUARIUMOTION Web App