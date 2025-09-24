#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import time
from mfrc522 import SimpleMFRC522

reader = SimpleMFRC522()

print("カードリーダーテスト開始")
print("カードをタッチしてください...")

try:
    while True:
        # ノンブロッキングでカード読み取りを試行
        try:
            print("カード待機中...")
            id, text = reader.read()
            print(f"カード検出! ID: {id}")
            print(f"16進数: {hex(id)}")
            break
        except Exception as e:
            print(f"読み取りエラー: {e}")
            time.sleep(1)

except KeyboardInterrupt:
    print("\nテスト終了")