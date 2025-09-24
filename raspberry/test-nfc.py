#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import nfc
import time

def on_connect(tag):
    """カードが検出された時の処理"""
    print(f"カード検出!")
    print(f"タグタイプ: {tag.type}")
    print(f"ID: {tag.identifier.hex().upper()}")
    return True

def main():
    print("NFC USBリーダーテスト開始")
    print("カードをタッチしてください...")

    try:
        # NFCリーダーに接続
        with nfc.ContactlessFrontend('usb') as clf:
            print("NFCリーダー接続成功")

            # カード待機
            while True:
                print("カード待機中...")
                tag = clf.connect(rdwr={'on-connect': on_connect})
                if tag:
                    time.sleep(1)  # 少し待機してから次の読み取り

    except Exception as e:
        print(f"NFCエラー: {e}")
        print("nfcpyライブラリがインストールされているか確認してください:")
        print("pip3 install nfcpy")

if __name__ == "__main__":
    main()