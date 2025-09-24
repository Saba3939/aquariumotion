#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import time
import requests
import json
import logging
from threading import Lock
import nfc
# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/home/pi/water_usage.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)
class WaterUsageController:
    def __init__(self, device_id, api_base_url, api_key):
        self.device_id = device_id
        self.api_base_url = api_base_url
        self.api_key = api_key
        self.clf = None
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
            if not self.clf:
                self.clf = nfc.ContactlessFrontend('usb')

            logger.info("カードをお待ちしています...")

            # カードIDを保存する変数
            card_id_result = {'id': None}

            def on_connect(tag):
                card_id_result['id'] = tag.identifier.hex().upper()
                logger.info(f"カード読み取り成功: {card_id_result['id']}")
                return False  # Falseを返して接続を終了

            # カード接続を待機
            self.clf.connect(rdwr={'on-connect': on_connect})

            return card_id_result['id']
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
        """サーバー側のアクティブセッション確認"""
        try:
            url = f"{self.api_base_url}/api/start-water-usage"
            params = {"cardId": card_id}
            response = requests.get(url, headers=self.headers, params=params, timeout=10)
            data = response.json()

            if response.status_code == 200 and data.get('success'):
                if data['data'].get('hasActiveSession'):
                    return data['data']
                else:
                    return None
            else:
                logger.error(f"セッション確認エラー: {data.get('error', '不明なエラー')}")
                return None
        except Exception as e:
            logger.error(f"セッション確認エラー: {e}")
            return None
    def handle_card_touch(self, card_id):
        """カードタッチイベント処理"""
        with self.session_lock:
            try:
                # まずサーバー側のセッション状態を確認
                server_session = self.check_active_session(card_id)

                # サーバー側とローカル状態の同期
                if server_session and not self.current_session:
                    # サーバー側にセッションがあるがローカルにない場合（復旧処理）
                    self.current_session = {
                        'session_id': server_session['sessionId'],
                        'card_id': card_id,
                        'start_time': time.time()  # 正確な開始時間は不明だが現在時刻で代用
                    }
                    logger.info(f"✅ サーバー側セッションと同期: {server_session['sessionId']}")

                elif not server_session and self.current_session:
                    # サーバー側にセッションがないがローカルにある場合（クリア処理）
                    logger.info("🔄 サーバー側セッション完了検知 - ローカル状態をクリア")
                    self.current_session = None

                # 実際の処理
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
                    # カード処理後の待機時間（連続読み取り防止）
                    time.sleep(3)
                # カード読み取り間隔
                time.sleep(0.5)
        except KeyboardInterrupt:
            logger.info("システム終了")
        except Exception as e:
            logger.error(f"システムエラー: {e}")
        finally:
            self.cleanup()
    def cleanup(self):
        """リソースクリーンアップ"""
        logger.info("リソースクリーンアップ中...")
        if self.clf:
            self.clf.close()
        # GPIO.cleanup() # 必要に応じて
if __name__ == "__main__":
    # 設定 - 実際の値に変更してください
    DEVICE_ID = "raspberry_pi_001"  # ラズパイ用デバイス固有ID
    API_BASE_URL = "https://aquariumotion-nextjs.vercel.app"  # 実際のデプロイURL
    API_KEY = "your_actual_api_key"  # 実際のAPIキー
    # システム開始
    controller = WaterUsageController(DEVICE_ID, API_BASE_URL, API_KEY)
    controller.run()
