# Raspberry Pi 実装要件とプログラム

## 概要

Raspberry PiはICカードリーダー（RC522）を制御し、カードタッチイベントをサーバーAPIに送信する役割を担います。

## ハードウェア要件

### 必要な機器
- **Raspberry Pi 4 Model B** (推奨) または Pi 3B+
- **RC522 RFID Reader Module**
- **ICカード** (MIFARE Classic 1K対応)
- **ジャンパーワイヤー**
- **ブレッドボード** (オプション)

### 配線図

```
RC522 → Raspberry Pi (GPIO)
VCC   → 3.3V (Pin 1)
RST   → GPIO 22 (Pin 15)
GND   → GND (Pin 6)
MISO  → GPIO 9 (Pin 21)
MOSI  → GPIO 10 (Pin 19)
SCK   → GPIO 11 (Pin 23)
SDA   → GPIO 8 (Pin 24)
```

## ソフトウェア要件

### 必要なライブラリ
```bash
# システム更新
sudo apt update && sudo apt upgrade -y

# Python ライブラリ
pip3 install requests
pip3 install mfrc522
pip3 install RPi.GPIO

# SPI有効化
sudo raspi-config
# Interface Options → SPI → Enable
```

## メインプログラム

### `water_usage_controller.py`

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import time
import requests
import json
import logging
from threading import Lock
from mfrc522 import SimpleMFRC522

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/water_usage.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class WaterUsageController:
    def __init__(self, device_id, api_base_url, api_key):
        self.device_id = device_id
        self.api_base_url = api_base_url
        self.api_key = api_key
        self.reader = SimpleMFRC522()
        self.session_lock = Lock()
        self.current_session = None

        # APIヘッダー
        self.headers = {
            'Content-Type': 'application/json',
            'x-api-key': self.api_key
        }

        logger.info(f"水使用量コントローラー初期化完了: Device ID={device_id}")

    def read_card(self):
        """ICカードを読み取る"""
        try:
            logger.info("カードをお待ちしています...")
            card_id, _ = self.reader.read()
            # カードIDを16進数文字列に変換
            card_id_hex = hex(card_id)[2:].upper().zfill(10)
            logger.info(f"カード読み取り成功: {card_id_hex}")
            return card_id_hex
        except Exception as e:
            logger.error(f"カード読み取りエラー: {e}")
            return None

    def start_water_usage(self, card_id):
        """水使用開始API呼び出し"""
        try:
            url = f"{self.api_base_url}/api/start-water-usage"
            payload = {
                "cardId": card_id,
                "deviceId": self.device_id
            }

            response = requests.post(url, headers=self.headers, json=payload, timeout=10)
            data = response.json()

            if response.status_code == 200 and data.get('success'):
                session_id = data['data']['sessionId']
                user_name = data['data']['userName']
                logger.info(f"使用開始成功: {user_name} (セッション: {session_id})")
                return session_id
            else:
                logger.error(f"使用開始失敗: {data.get('error', '不明なエラー')}")
                return None

        except requests.exceptions.RequestException as e:
            logger.error(f"API通信エラー (使用開始): {e}")
            return None
        except Exception as e:
            logger.error(f"使用開始処理エラー: {e}")
            return None

    def end_water_usage(self, card_id, session_id):
        """水使用終了API呼び出し"""
        try:
            url = f"{self.api_base_url}/api/end-water-usage"
            payload = {
                "cardId": card_id,
                "sessionId": session_id
            }

            response = requests.post(url, headers=self.headers, json=payload, timeout=10)
            data = response.json()

            if response.status_code == 200 and data.get('success'):
                logger.info(f"使用終了指示送信成功: {data['data']['message']}")
                return True
            else:
                logger.error(f"使用終了失敗: {data.get('error', '不明なエラー')}")
                return False

        except requests.exceptions.RequestException as e:
            logger.error(f"API通信エラー (使用終了): {e}")
            return False
        except Exception as e:
            logger.error(f"使用終了処理エラー: {e}")
            return False

    def check_active_session(self, card_id):
        """アクティブセッション確認"""
        try:
            # カードIDからユーザーIDを取得してセッション確認
            # 実装上、カードIDから直接確認は難しいため、
            # 内部状態で管理するか、別途APIで確認
            return self.current_session
        except Exception as e:
            logger.error(f"セッション確認エラー: {e}")
            return None

    def handle_card_touch(self, card_id):
        """カードタッチイベント処理"""
        with self.session_lock:
            try:
                if self.current_session is None:
                    # 使用開始
                    session_id = self.start_water_usage(card_id)
                    if session_id:
                        self.current_session = {
                            'session_id': session_id,
                            'card_id': card_id,
                            'start_time': time.time()
                        }
                        logger.info("✅ 水使用測定を開始しました")
                        self.show_status("使用開始", f"セッション: {session_id[:8]}...")
                    else:
                        logger.error("❌ 使用開始に失敗しました")
                        self.show_status("エラー", "使用開始失敗")

                elif self.current_session['card_id'] == card_id:
                    # 同じカードで使用終了
                    session_id = self.current_session['session_id']
                    if self.end_water_usage(card_id, session_id):
                        duration = time.time() - self.current_session['start_time']
                        logger.info(f"✅ 使用終了指示送信完了 (使用時間: {duration:.1f}秒)")
                        self.current_session = None
                        self.show_status("使用終了", f"測定時間: {duration:.1f}秒")
                    else:
                        logger.error("❌ 使用終了に失敗しました")
                        self.show_status("エラー", "使用終了失敗")

                else:
                    # 異なるカードでのタッチ
                    logger.warning(f"⚠️  異なるカードが検出されました: {card_id}")
                    self.show_status("エラー", "異なるカード")

            except Exception as e:
                logger.error(f"カードタッチ処理エラー: {e}")
                self.show_status("エラー", "処理失敗")

    def show_status(self, status, message):
        """ステータス表示（LED、ディスプレイなど拡張可能）"""
        print(f"[{status}] {message}")
        # TODO: LED点灯やディスプレイ表示の実装

    def run(self):
        """メインループ"""
        logger.info("🚰 水使用量測定システム開始")

        try:
            while True:
                card_id = self.read_card()
                if card_id:
                    self.handle_card_touch(card_id)

                # カード読み取り間隔
                time.sleep(1)

        except KeyboardInterrupt:
            logger.info("システム終了")
        except Exception as e:
            logger.error(f"システムエラー: {e}")
        finally:
            self.cleanup()

    def cleanup(self):
        """リソースクリーンアップ"""
        logger.info("リソースクリーンアップ中...")
        # GPIO.cleanup() # 必要に応じて

if __name__ == "__main__":
    # 設定
    DEVICE_ID = "water_device_001"  # デバイス固有ID
    API_BASE_URL = "https://your-app.vercel.app"  # AQUARIUMOTIONのURL
    API_KEY = "your_esp32_api_key"  # 環境変数から取得推奨

    # システム開始
    controller = WaterUsageController(DEVICE_ID, API_BASE_URL, API_KEY)
    controller.run()
```

## 設定ファイル

### `config.json`

```json
{
  "device_id": "water_device_001",
  "api_base_url": "https://your-app.vercel.app",
  "api_key": "your_esp32_api_key",
  "card_reader": {
    "read_timeout": 5.0,
    "retry_count": 3
  },
  "logging": {
    "level": "INFO",
    "file": "/var/log/water_usage.log"
  },
  "network": {
    "timeout": 10,
    "retry_interval": 5
  }
}
```

## システムサービス設定

### `/etc/systemd/system/water-usage.service`

```ini
[Unit]
Description=Water Usage Measurement System
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/water-usage
ExecStart=/usr/bin/python3 /home/pi/water-usage/water_usage_controller.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### サービス有効化

```bash
# サービス登録
sudo systemctl daemon-reload
sudo systemctl enable water-usage.service

# サービス開始
sudo systemctl start water-usage.service

# ステータス確認
sudo systemctl status water-usage.service

# ログ確認
sudo journalctl -u water-usage.service -f
```

## 実装手順

### 1. ハードウェア準備
1. Raspberry PiにRC522を配線
2. SPI通信を有効化
3. 動作テスト

### 2. ソフトウェア準備
1. 必要ライブラリをインストール
2. プログラムファイルを配置
3. 設定ファイルを編集

### 3. 動作確認
1. カード読み取りテスト
2. API通信テスト
3. エラーハンドリング確認

### 4. 本格運用
1. システムサービス登録
2. 自動起動設定
3. ログ監視設定

## トラブルシューティング

### よくある問題

1. **カードが読み取れない**
   - SPI通信の確認
   - 配線の再確認
   - カードの種類確認

2. **API通信エラー**
   - ネットワーク接続確認
   - API KEYの確認
   - URLの確認

3. **権限エラー**
   - GPIO権限の確認
   - ファイル権限の確認

### ログ確認

```bash
# 直近のログ
tail -f /var/log/water_usage.log

# エラーログのみ
grep ERROR /var/log/water_usage.log

# システムログ
sudo journalctl -u water-usage.service
```

## セキュリティ考慮事項

1. **API KEY管理**
   - 環境変数またはセキュアファイルに保存
   - 定期的にローテーション

2. **ネットワークセキュリティ**
   - HTTPS通信必須
   - ファイアウォール設定

3. **物理セキュリティ**
   - デバイスの物理的保護
   - 不正アクセス防止

## 拡張機能（オプション）

### LED指示機能
```python
import RPi.GPIO as GPIO

class LEDController:
    def __init__(self, green_pin=18, red_pin=19):
        self.green_pin = green_pin
        self.red_pin = red_pin
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(self.green_pin, GPIO.OUT)
        GPIO.setup(self.red_pin, GPIO.OUT)

    def success_blink(self):
        for _ in range(3):
            GPIO.output(self.green_pin, GPIO.HIGH)
            time.sleep(0.2)
            GPIO.output(self.green_pin, GPIO.LOW)
            time.sleep(0.2)

    def error_blink(self):
        for _ in range(5):
            GPIO.output(self.red_pin, GPIO.HIGH)
            time.sleep(0.1)
            GPIO.output(self.red_pin, GPIO.LOW)
            time.sleep(0.1)
```

### ディスプレイ表示機能
```python
# I2C LCDディスプレイ制御（例：16x2 LCD）
import board
import digitalio
import adafruit_character_lcd.character_lcd as characterlcd

class DisplayController:
    def __init__(self):
        # LCD設定
        lcd_rs = digitalio.DigitalInOut(board.D26)
        lcd_en = digitalio.DigitalInOut(board.D19)
        lcd_d4 = digitalio.DigitalInOut(board.D13)
        lcd_d5 = digitalio.DigitalInOut(board.D6)
        lcd_d6 = digitalio.DigitalInOut(board.D5)
        lcd_d7 = digitalio.DigitalInOut(board.D11)

        self.lcd = characterlcd.Character_LCD_Mono(
            lcd_rs, lcd_en, lcd_d4, lcd_d5, lcd_d6, lcd_d7, 16, 2
        )

    def show_message(self, line1, line2=""):
        self.lcd.clear()
        self.lcd.message = f"{line1}\n{line2}"
```

これでRaspberry Piの実装が完了しました。続いてESP32の実装ドキュメントを作成します。