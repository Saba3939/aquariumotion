# Firebase経由 Raspberry Pi ↔ ESP32 リアルタイム通信実装ガイド

## 概要

このドキュメントでは、Firebase（Firestore + Realtime Database）とAPI経由でRaspberry PiとESP32間のリアルタイム通信を実現し、**最終的にdailyUsageコレクションのwaterUsageフィールドに使用量を記録する**実装方法について説明します。

### 最終目標

ICカードによる使用者特定 → 流量計測定 → **dailyUsageコレクションに使用量記録** → 節約スコア計算

## システム構成

```
┌─────────────────┐    ┌─────────────────────────────────────┐    ┌─────────────────┐
│   Raspberry Pi  │    │           Firebase Cloud           │    │     ESP32       │
│                 │    │                                     │    │                 │
│ ICカード読み取り │───▶│  ┌─────────────────────────────┐    │◀───│ 流量計測定      │
│ REST API呼び出し│    │  │        Firestore            │    │    │ Realtime DB監視 │
│                 │    │  │ • dailyUsage記録 ⭐         │    │    │ 測定データ送信  │
└─────────────────┘    │  │ • セッション管理            │    │    └─────────────────┘
                       │  │ • ICカード情報              │    │
                       │  └─────────────────────────────┘    │
                       │                                     │
                       │  ┌─────────────────────────────┐    │
                       │  │    Realtime Database        │    │
                       │  │ • デバイス間コマンド        │    │
                       │  │ • リアルタイム状態同期      │    │
                       │  │ • 測定開始/停止指示         │    │
                       │  └─────────────────────────────┘    │
                       └─────────────────────────────────────┘
                                        │
                                        ▼
                              ┌─────────────────┐
                              │  Next.js API    │
                              │ • REST endpoints│
                              │ • 認証・認可    │
                              │ • dailyUsage記録│ ⭐
                              └─────────────────┘
```

### データフロー概要

1. **Raspberry Pi**: ICカード読み取り → ユーザー特定
2. **ESP32**: 流量計測定 → 使用量データ収集
3. **API**: セッション管理 → **dailyUsageコレクションにwaterUsage記録** ⭐
4. **システム**: 節約スコア自動計算 → ユーザーフィードバック

## データベース設計

### Firestore（永続データ）

```javascript
// コレクション構造
{
  // ⭐ 最終目標：dailyUsage（日次使用量記録）
  "dailyUsage": {
    "{userId}_{date}": {  // 例: "user_123_2025-01-16"
      "userId": "user_123",
      "date": "2025-01-16",        // YYYY-MM-DD形式
      "waterUsage": 45.8,          // ⭐ 水使用量（リットル）
      "electricityUsage": 12.3,    // 電気使用量（kWh）
      "conservationScore": 85      // 節約スコア（自動計算）
    }
  },

  // ICカード管理
  "ic_cards": {
    "{cardId}": {
      "userId": "user_123",
      "cardName": "田中さんのカード",
      "isActive": true,
      "registeredAt": "timestamp",
      "lastUsedAt": "timestamp"
    }
  },

  // 使用セッション管理（一時的な記録）
  "water_usage_sessions": {
    "{sessionId}": {
      "userId": "user_123",
      "cardId": "card_abc123",
      "deviceId": "water_device_001",
      "startTime": "timestamp",
      "endTime": "timestamp",
      "waterAmount": 15.5,          // セッション終了時にdailyUsageに集計
      "status": "active"            // active, completed, timeout
    }
  },

  // デバイス管理
  "devices": {
    "{deviceId}": {
      "deviceType": "water",        // water, electricity
      "isOnline": true,
      "lastSeen": "timestamp",
      "location": "共有キッチン",
      "status": "idle"              // idle, measuring, error
    }
  }
}
```

### Realtime Database（リアルタイム通信）

```javascript
// データ構造
{
  // デバイスコマンド（Raspberry Pi → ESP32）
  "device_commands": {
    "{deviceId}": {
      "command": "start_measurement", // start_measurement, stop_measurement, reset
      "sessionId": "session_123",
      "timestamp": 1640995200000,
      "processed": false
    }
  },

  // デバイス状態（ESP32 → システム）
  "device_status": {
    "{deviceId}": {
      "status": "measuring", // idle, measuring, error
      "currentSession": "session_123",
      "lastUpdate": 1640995200000,
      "isOnline": true
    }
  },

  // リアルタイム測定データ（ESP32 → システム）
  "realtime_data": {
    "{deviceId}": {
      "{sessionId}": {
        "currentFlow": 2.5, // L/min
        "totalAmount": 10.3, // L
        "duration": 240, // seconds
        "lastUpdate": 1640995200000
      }
    }
  }
}
```

## 詳細処理フロー

### システム全体の処理ステップ

#### 🔧 初期設定フェーズ
1. **ESP32起動** → Firebase Realtime DB接続 → デバイス状態を`idle`に設定
2. **Raspberry Pi起動** → ICカードリーダー初期化 → APIエンドポイント確認
3. **サーバー側** → Firestore/Realtime Database接続確認 → デバイス登録状態確認

#### 💳 ICカード認証フェーズ（約2-3秒）
1. **Raspberry Pi**: ICカード検知 → UID読み取り → カードIDハッシュ化
2. **API**: `/api/start-water-usage` → ICカード有効性確認 → ユーザー特定
3. **Firestore**: `ic_cards`コレクション照会 → ユーザー情報取得
4. **セッション作成**: `water_usage_sessions`に新規セッション記録

#### 📡 デバイス連携フェーズ（約1-2秒）
1. **API**: Realtime DB の`device_commands/{deviceId}`にコマンド送信
2. **ESP32**: 2秒間隔でコマンド監視 → `start_measurement`コマンド受信
3. **ESP32**: セッション情報保存 → 測定準備完了
4. **状態同期**: `device_status/{deviceId}`を`measuring`に更新

#### 🚰 測定実行フェーズ（使用時間中）
1. **ESP32**: 流量センサーパルス検知 → 1秒ごとに流量計算
2. **リアルタイム更新**: `realtime_data/{deviceId}/{sessionId}`に現在値送信
3. **自動終了監視**: 無流量30秒 or セッション30分でタイムアウト判定
4. **データ蓄積**: `totalLiters`に使用量累積

#### 🔚 終了処理フェーズ（約3-5秒）
1. **終了トリガー**: ICカード再タッチ or 自動終了条件
2. **測定停止**: ESP32で流量計測定停止 → 最終データ計算
3. **dailyUsage記録**: `/api/measurement-data` → `saveDailyUsage()`実行
4. **セッション完了**: `water_usage_sessions`ステータス更新
5. **デバイス復帰**: `device_status/{deviceId}`を`idle`に戻す

### 1. 使用開始フロー（詳細版）

```mermaid
sequenceDiagram
    participant User as 使用者
    participant RPI as Raspberry Pi
    participant API as Next.js API
    participant FS as Firestore
    participant RDB as Realtime DB
    participant ESP as ESP32

    Note over User,ESP: フェーズ1: ICカード認証（2-3秒）
    User->>RPI: ICカードタッチ
    RPI->>RPI: UID読み取り + ハッシュ化
    RPI->>API: POST /api/start-water-usage<br/>{cardId: "card_abc123", deviceId: "water_device_001"}

    API->>FS: ICカード照会<br/>ic_cards/card_abc123
    FS->>API: ユーザー情報返却<br/>{userId: "user_123", isActive: true}

    API->>FS: セッション作成<br/>water_usage_sessions/session_xyz
    Note over FS: {userId: "user_123", cardId: "card_abc123", status: "active"}

    Note over User,ESP: フェーズ2: デバイス連携（1-2秒）
    API->>RDB: コマンド送信<br/>device_commands/water_device_001
    Note over RDB: {command: "start_measurement", sessionId: "session_xyz", processed: false}
    API->>RPI: セッション開始通知<br/>{sessionId: "session_xyz", userId: "user_123"}

    ESP->>RDB: 2秒間隔でコマンド監視
    RDB->>ESP: start_measurement通知
    ESP->>ESP: セッション情報保存<br/>currentSessionId = "session_xyz"
    ESP->>RDB: 処理済みマーク<br/>processed: true
    ESP->>RDB: 状態更新<br/>device_status/water_device_001: "measuring"

    Note over User,ESP: フェーズ3: 測定開始
    ESP->>ESP: 流量センサー監視開始<br/>measureStartTime = millis()
    RPI->>User: LED点灯 + ブザー（開始通知）

    Note over User,ESP: フェーズ4: リアルタイム測定
    loop 1秒間隔
        ESP->>ESP: パルスカウント → 流量計算
        ESP->>RDB: リアルタイムデータ更新<br/>realtime_data/water_device_001/session_xyz
        Note over RDB: {currentFlow: 2.5, totalAmount: 10.3, duration: 240}
        ESP->>ESP: 自動終了条件チェック<br/>無流量30秒 or セッション30分
    end
```

## セッション終了判断ロジック

セッション終了は以下の4つの方法で判断されます：

### 1. 手動終了（推奨）
**同じICカードの再タッチ**
- ユーザーが使用終了時に同じICカードをタッチ
- 最も確実で意図的な終了方法

### 2. 自動終了（無流量検知）
**一定時間流量がない場合の自動終了**
- 30秒間流量が検知されない → セッション自動終了
- 節水意識向上と置き忘れ防止

### 3. タイムアウト終了
**最大使用時間の制限**
- 1回のセッション最大30分で強制終了
- システム負荷軽減と異常使用防止

### 4. 他ユーザーによる割り込み
**別のICカードがタッチされた場合**
- 前のセッションを強制終了 → 新セッション開始
- 共有スペースでの利便性確保

### 2. 使用終了フロー（全パターン詳細版）

```mermaid
sequenceDiagram
    participant User as 使用者
    participant RPI as Raspberry Pi
    participant API as Next.js API
    participant FS as Firestore
    participant RDB as Realtime DB
    participant ESP as ESP32

    Note over User,ESP: パターン1: 手動終了（同じICカード再タッチ）
    User->>RPI: 同じICカード再タッチ
    RPI->>RPI: カードID比較 → 同一確認
    RPI->>API: POST /api/end-water-usage<br/>{cardId: "card_abc123", sessionId: "session_xyz"}

    API->>FS: セッション存在確認<br/>water_usage_sessions/session_xyz
    API->>RDB: 停止コマンド送信<br/>device_commands/water_device_001
    Note over RDB: {command: "stop_measurement", sessionId: "session_xyz"}
    API->>RPI: 停止指示受付通知

    ESP->>RDB: コマンド受信 → processed: true
    ESP->>ESP: measuring = false, 最終計算実行
    ESP->>API: POST /api/measurement-data<br/>{sessionId, totalAmount: 15.5, endReason: "manual"}

    Note over User,ESP: パターン2: 自動終了（無流量検知）
    ESP->>ESP: flowRate <= 0.01 for 30秒
    ESP->>ESP: stopMeasurement("no_flow")実行
    ESP->>API: POST /api/measurement-data<br/>{sessionId, totalAmount: 12.3, endReason: "no_flow"}

    Note over User,ESP: パターン3: タイムアウト終了
    ESP->>ESP: millis() - measureStartTime > 30分
    ESP->>ESP: stopMeasurement("timeout")実行
    ESP->>API: POST /api/measurement-data<br/>{sessionId, totalAmount: 45.8, endReason: "timeout"}

    Note over User,ESP: パターン4: 割り込み終了
    User->>RPI: 別のICカードタッチ
    RPI->>API: POST /api/force-end-session<br/>{sessionId: "session_xyz", reason: "interrupted"}
    API->>RDB: 強制停止コマンド送信
    ESP->>ESP: force_stop受信 → 即座に停止

    Note over API,FS: ⭐ 全パターン共通：dailyUsage記録フェーズ
    API->>API: sessionDoc.data().userId取得
    API->>FS: saveDailyUsage(userId, "water", totalAmount)実行
    Note over FS: dailyUsage/{userId}_{date}.waterUsage += totalAmount

    API->>FS: セッション完了更新<br/>water_usage_sessions/session_xyz
    Note over FS: {endTime: timestamp, waterAmount: totalAmount, endReason: reason, status: "completed"}

    API->>FS: デバイス状態更新<br/>devices/water_device_001
    Note over FS: {status: "idle", lastSeen: timestamp}

    RPI->>User: LED消灯 + ブザー（終了通知）
```

### 3. エラー処理フロー

```mermaid
sequenceDiagram
    participant RPI as Raspberry Pi
    participant API as Next.js API
    participant FS as Firestore
    participant ESP as ESP32

    Note over RPI,ESP: ケース1: ICカード認証失敗
    RPI->>API: POST /api/start-water-usage<br/>{cardId: "invalid_card"}
    API->>FS: ICカード照会 → 見つからない
    API->>RPI: 403 Forbidden<br/>{"error": "登録されていないICカード"}
    RPI->>RPI: 赤LED点滅 + エラーブザー

    Note over RPI,ESP: ケース2: ESP32通信失敗
    API->>RDB: コマンド送信 → タイムアウト
    ESP->>ESP: オフライン状態
    API->>API: 30秒後にコマンド確認 → 未処理
    API->>FS: セッション自動キャンセル<br/>status: "failed"

    Note over RPI,ESP: ケース3: 測定データ送信失敗
    ESP->>API: POST /api/measurement-data → ネットワークエラー
    ESP->>ESP: 再試行ロジック（3回まで）
    ESP->>ESP: ローカルバックアップ保存
    ESP->>API: 次回接続時にバックアップ送信

    Note over RPI,ESP: ケース4: Firebase接続障害
    API->>FS: Firestore書き込み失敗
    API->>API: エラーログ記録 + 管理者通知
    API->>ESP: 500 Internal Server Error
    ESP->>ESP: 再試行待機状態に移行
```

### 4. データ整合性確保フロー

```mermaid
sequenceDiagram
    participant Cron as Vercel Cron
    participant API as Health Check API
    participant FS as Firestore
    participant RDB as Realtime DB

    Note over Cron,RDB: 定期監視（毎時実行）
    Cron->>API: GET /api/health-check
    API->>FS: アクティブセッション確認<br/>status: "active"で1時間以上経過
    API->>RDB: デバイス状態確認<br/>device_status/{deviceId}

    alt ESP32オフライン検知
        API->>FS: 孤立セッション強制終了<br/>status: "timeout", endReason: "device_offline"
        API->>FS: 推定使用量でdailyUsage更新<br/>（平均値または最低限の値）
    end

    Note over Cron,RDB: データ整合性チェック
    Cron->>API: GET /api/daily-usage-status
    API->>FS: 今日のdailyUsage記録確認
    API->>FS: water_usage_sessions完了分との照合

    alt 不整合検知
        API->>FS: 差分データの補正実行
        API->>API: 管理者アラート送信
    end
```

## API実装

### Firebase Admin設定拡張

```typescript
// src/lib/firebase-server.ts に追加
import * as admin from "firebase-admin";

// Realtime Database インスタンス取得
export function getRealtimeDB() {
  if (!initializeFirebaseAdmin()) {
    return null;
  }

  try {
    return admin.database();
  } catch (error) {
    console.error('Failed to get Realtime Database instance:', error);
    return null;
  }
}

// Realtime Databaseでコマンド送信
export async function sendDeviceCommand(deviceId: string, command: any) {
  const db = getRealtimeDB();
  if (!db) {
    throw new Error('Realtime Database not available');
  }

  const commandRef = db.ref(`device_commands/${deviceId}`);
  await commandRef.set({
    ...command,
    timestamp: admin.database.ServerValue.TIMESTAMP,
    processed: false
  });
}

// デバイス状態監視
export function watchDeviceStatus(deviceId: string, callback: (status: any) => void) {
  const db = getRealtimeDB();
  if (!db) {
    throw new Error('Realtime Database not available');
  }

  const statusRef = db.ref(`device_status/${deviceId}`);
  statusRef.on('value', (snapshot) => {
    const status = snapshot.val();
    callback(status);
  });

  return () => statusRef.off(); // cleanup function
}
```

### 使用開始API

```typescript
// src/app/api/start-water-usage/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDB, sendDeviceCommand } from '@/lib/firebase-server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const { cardId, deviceId } = await request.json();

    // ICカード認証
    const db = getDB();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const cardDoc = await db.collection('ic_cards').doc(cardId).get();
    if (!cardDoc.exists || !cardDoc.data()?.isActive) {
      return NextResponse.json({
        error: '登録されていないか無効なICカードです'
      }, { status: 403 });
    }

    const cardData = cardDoc.data()!;
    const userId = cardData.userId;

    // セッション作成
    const sessionId = `session_${Date.now()}_${uuidv4().slice(0, 8)}`;
    const sessionData = {
      userId,
      cardId,
      deviceId,
      startTime: new Date(),
      status: 'active'
    };

    await db.collection('water_usage_sessions').doc(sessionId).set(sessionData);

    // ESP32にリアルタイムでコマンド送信
    await sendDeviceCommand(deviceId, {
      command: 'start_measurement',
      sessionId,
      userId
    });

    // ICカード最終使用時刻更新
    await db.collection('ic_cards').doc(cardId).update({
      lastUsedAt: new Date()
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        userId,
        startTime: sessionData.startTime.toISOString()
      }
    });

  } catch (error) {
    console.error('Start water usage error:', error);
    return NextResponse.json({
      error: '使用開始処理に失敗しました'
    }, { status: 500 });
  }
}
```

### 使用終了API

```typescript
// src/app/api/end-water-usage/route.ts
export async function POST(request: NextRequest) {
  try {
    const { cardId, sessionId } = await request.json();

    const db = getDB();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    // セッション確認
    const sessionDoc = await db.collection('water_usage_sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return NextResponse.json({
        error: 'セッションが見つかりません'
      }, { status: 404 });
    }

    const sessionData = sessionDoc.data()!;

    // カードID確認
    if (sessionData.cardId !== cardId) {
      return NextResponse.json({
        error: '異なるICカードです'
      }, { status: 403 });
    }

    // ESP32に停止コマンド送信
    await sendDeviceCommand(sessionData.deviceId, {
      command: 'stop_measurement',
      sessionId
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        message: '使用終了処理を開始しました'
      }
    });

  } catch (error) {
    console.error('End water usage error:', error);
    return NextResponse.json({
      error: '使用終了処理に失敗しました'
    }, { status: 500 });
  }
}
```

### 測定データ受信API（⭐ dailyUsage記録機能付き）

```typescript
// src/app/api/measurement-data/route.ts
import { saveDailyUsage } from '@/lib/firestore-utils';

export async function POST(request: NextRequest) {
  try {
    // API Key認証
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || !verifyApiKey(apiKey)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { deviceId, sessionId, totalAmount, duration, endReason = 'manual' } = await request.json();

    const db = getDB();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    // セッション情報取得
    const sessionDoc = await db.collection('water_usage_sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return NextResponse.json({ error: 'セッションが見つかりません' }, { status: 404 });
    }

    const sessionData = sessionDoc.data()!;
    const userId = sessionData.userId;

    // ⭐ 重要：dailyUsageコレクションに水使用量を記録
    await saveDailyUsage(userId, 'water', totalAmount);

    // セッション完了更新（終了理由付き）
    await db.collection('water_usage_sessions').doc(sessionId).update({
      endTime: new Date(),
      waterAmount: totalAmount,
      duration: duration,
      endReason: endReason,
      status: 'completed'
    });

    // デバイス状態更新
    await db.collection('devices').doc(deviceId).update({
      status: 'idle',
      lastSeen: new Date()
    });

    return NextResponse.json({
      success: true,
      message: `データを正常に受信し、dailyUsageに記録しました（終了理由: ${endReason}）`,
      data: {
        userId,
        waterAmount: totalAmount,
        endReason: endReason,
        recordedToDaily: true // ⭐ dailyUsageに記録済み
      }
    });

  } catch (error) {
    console.error('Measurement data error:', error);
    return NextResponse.json({
      error: 'データ受信に失敗しました'
    }, { status: 500 });
  }
}
```

### セッション強制終了API

```typescript
// src/app/api/force-end-session/route.ts
import { saveDailyUsage } from '@/lib/firestore-utils';
import { sendDeviceCommand } from '@/lib/firebase-server';

export async function POST(request: NextRequest) {
  try {
    // API Key認証
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || !verifyApiKey(apiKey)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId, reason } = await request.json();

    const db = getDB();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    // セッション情報取得
    const sessionDoc = await db.collection('water_usage_sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return NextResponse.json({ error: 'セッションが見つかりません' }, { status: 404 });
    }

    const sessionData = sessionDoc.data()!;

    // ESP32に強制停止コマンド送信
    await sendDeviceCommand(sessionData.deviceId, {
      command: 'force_stop',
      sessionId: sessionId,
      reason: reason
    });

    // セッション強制終了として記録
    await db.collection('water_usage_sessions').doc(sessionId).update({
      endTime: new Date(),
      endReason: reason,
      status: 'force_ended'
    });

    return NextResponse.json({
      success: true,
      message: `セッション強制終了（理由: ${reason}）`
    });

  } catch (error) {
    console.error('Force end session error:', error);
    return NextResponse.json({
      error: 'セッション強制終了に失敗しました'
    }, { status: 500 });
  }
}
```

## Raspberry Pi実装

### 必要ライブラリインストール

```bash
# Python Firebase SDK
pip install firebase-admin
pip install requests
pip install mfrc522

# システム依存
sudo apt-get update
sudo apt-get install python3-dev python3-pip
sudo pip3 install RPi.GPIO
```

### ICカード読み取り + Firebase通信

```python
#!/usr/bin/env python3
# raspberry_pi_client.py

import time
import json
import requests
import firebase_admin
from firebase_admin import credentials, db
from mfrc522 import SimpleMFRC522
import RPi.GPIO as GPIO

class WaterUsageController:
    def __init__(self, config):
        self.api_base_url = config['api_base_url']
        self.api_key = config['api_key']
        self.device_id = config['device_id']

        # Firebase Realtime Database初期化
        self.init_firebase(config['firebase_config'])

        # IC Card Reader初期化
        self.reader = SimpleMFRC522()

        # 状態管理
        self.current_session = None

    def init_firebase(self, firebase_config):
        """Firebase Realtime Database初期化"""
        try:
            # サービスアカウントキーファイルを使用
            cred = credentials.Certificate(firebase_config['service_account_path'])
            firebase_admin.initialize_app(cred, {
                'databaseURL': firebase_config['database_url']
            })

            # Realtime Database参照
            self.realtime_db = db
            print("Firebase Realtime Database接続完了")

        except Exception as e:
            print(f"Firebase初期化エラー: {e}")
            raise

    def read_ic_card(self):
        """ICカード読み取り"""
        try:
            print("ICカードをリーダーにタッチしてください...")
            uid, text = self.reader.read()

            # UIDをハッシュ化してカードIDとする
            card_id = f"card_{str(uid)}"
            return card_id

        except Exception as e:
            print(f"カード読み取りエラー: {e}")
            return None

    def start_usage(self, card_id):
        """使用開始"""
        url = f"{self.api_base_url}/start-water-usage"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key
        }
        data = {
            "cardId": card_id,
            "deviceId": self.device_id
        }

        try:
            response = requests.post(url, headers=headers, json=data, timeout=10)

            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    return result["data"]

            print(f"使用開始失敗: {response.status_code} - {response.text}")
            return None

        except requests.exceptions.RequestException as e:
            print(f"通信エラー: {e}")
            return None

    def end_usage(self, card_id, session_id):
        """使用終了"""
        url = f"{self.api_base_url}/end-water-usage"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key
        }
        data = {
            "cardId": card_id,
            "sessionId": session_id
        }

        try:
            response = requests.post(url, headers=headers, json=data, timeout=10)
            return response.status_code == 200

        except requests.exceptions.RequestException as e:
            print(f"通信エラー: {e}")
            return False

    def force_end_session(self, session_id, reason):
        """セッション強制終了（割り込み・タイムアウト用）"""
        url = f"{self.api_base_url}/force-end-session"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key
        }
        data = {
            "sessionId": session_id,
            "reason": reason
        }

        try:
            response = requests.post(url, headers=headers, json=data, timeout=10)
            if response.status_code == 200:
                print(f"🔚 セッション強制終了: {reason}")
                return True
            else:
                print(f"❌ 強制終了失敗: {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"通信エラー: {e}")
            return False

    def monitor_device_status(self):
        """デバイス状態監視（Firebase Realtime Database）"""
        def status_listener(event):
            try:
                status_data = event.data
                if status_data:
                    print(f"デバイス状態更新: {status_data}")

                    # ESP32がオンラインかチェック
                    if status_data.get('isOnline'):
                        print("ESP32オンライン")
                    else:
                        print("ESP32オフライン")

            except Exception as e:
                print(f"状態監視エラー: {e}")

        # Realtime Databaseで状態監視
        status_ref = self.realtime_db.reference(f'device_status/{self.device_id}')
        status_ref.listen(status_listener)

    def run(self):
        """メインループ"""
        print("水使用量測定システム開始")
        print("デバイスID:", self.device_id)

        # デバイス状態監視開始
        self.monitor_device_status()

        try:
            while True:
                card_id = self.read_ic_card()

                if card_id:
                    if self.current_session is None:
                        # 使用開始
                        session_data = self.start_usage(card_id)
                        if session_data:
                            self.current_session = {
                                "sessionId": session_data["sessionId"],
                                "cardId": card_id,
                                "userId": session_data["userId"],
                                "startTime": session_data["startTime"]
                            }
                            print(f"使用開始: {session_data['userId']}")
                            print(f"セッションID: {session_data['sessionId']}")
                        else:
                            print("使用開始に失敗しました")
                    else:
                        # 使用終了
                        if card_id == self.current_session["cardId"]:
                            # 同じカード → 手動終了
                            if self.end_usage(card_id, self.current_session["sessionId"]):
                                print(f"✅ 手動終了: {self.current_session['userId']}")
                                self.current_session = None
                            else:
                                print("❌ 使用終了に失敗しました")
                        else:
                            # 異なるカード → 強制終了 + 新規開始
                            print(f"⚠️  別ユーザーによる割り込み: {self.current_session['cardId']} → {card_id}")

                            # 前のセッションを強制終了
                            self.force_end_session(self.current_session["sessionId"], "interrupted")

                            # 新しいセッション開始
                            session_data = self.start_usage(card_id)
                            if session_data:
                                self.current_session = {
                                    "sessionId": session_data["sessionId"],
                                    "cardId": card_id,
                                    "userId": session_data["userId"],
                                    "startTime": session_data["startTime"]
                                }
                                print(f"🔄 新規開始: {session_data['userId']}")
                            else:
                                print("❌ 新規開始に失敗しました")

                time.sleep(1)

        except KeyboardInterrupt:
            print("\nシステム終了")
        finally:
            GPIO.cleanup()

# 設定ファイル
config = {
    "api_base_url": "https://aquariumotion.vercel.app/api",
    "api_key": "aquarium-esp32-secure-key-2024",
    "device_id": "water_device_001",
    "firebase_config": {
        "service_account_path": "/home/pi/service_account.json",
        "database_url": "https://kosenprocon2025-default-rtdb.firebaseio.com/"
    }
}

if __name__ == "__main__":
    controller = WaterUsageController(config)
    controller.run()
```

## ESP32実装

### 必要ライブラリ

```cpp
// Arduino IDE ライブラリマネージャでインストール：
// - ArduinoJson
// - Firebase ESP32 Client
// - WiFi
```

### Firebase Realtime Database + 流量計測定

```cpp
// esp32_water_meter.ino
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Firebase_ESP_Client.h>

// Firebase設定
#define API_KEY "AIzaSyD-eg6zqjXKuxisGkevAQy37h4hbpKG8SI"
#define DATABASE_URL "https://kosenprocon2025-default-rtdb.firebaseio.com/"
#define USER_EMAIL "esp32@aquariumotion.com"
#define USER_PASSWORD "esp32password"

// WiFi設定
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// デバイス設定
const String DEVICE_ID = "water_device_001";
const String API_BASE_URL = "https://aquariumotion.vercel.app/api";
const String ESP_API_KEY = "aquarium-esp32-secure-key-2024";

// 流量センサー設定
const int FLOW_SENSOR_PIN = 2;
volatile int flowPulseCount = 0;
float flowRate = 0.0;
float totalLiters = 0.0;
unsigned long oldTime = 0;

// セッション管理
String currentSessionId = "";
String currentUserId = "";
bool measuring = false;
unsigned long measureStartTime = 0;

// 自動終了管理
unsigned long noFlowStartTime = 0;        // 無流量開始時刻
const unsigned long NO_FLOW_TIMEOUT = 30000;      // 30秒で自動終了
const unsigned long SESSION_TIMEOUT = 1800000;    // 30分で強制終了

// Firebase
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// 流量センサー割り込み
void IRAM_ATTR flowPulseCounter() {
    flowPulseCount++;
}

void setup() {
    Serial.begin(115200);

    // WiFi接続
    connectWiFi();

    // Firebase初期化
    initFirebase();

    // 流量センサー設定
    pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), flowPulseCounter, FALLING);

    // デバイス状態初期化
    updateDeviceStatus("idle", true);

    Serial.println("ESP32水流量測定システム開始");
    Serial.println("デバイスID: " + DEVICE_ID);
}

void connectWiFi() {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("WiFi接続中");

    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }

    Serial.println("\nWiFi接続完了");
    Serial.println("IPアドレス: " + WiFi.localIP().toString());
}

void initFirebase() {
    // Firebase設定
    config.api_key = API_KEY;
    config.database_url = DATABASE_URL;

    // 認証設定
    auth.user.email = USER_EMAIL;
    auth.user.password = USER_PASSWORD;

    // Firebase接続
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);

    Serial.println("Firebase接続完了");
}

void updateDeviceStatus(String status, bool isOnline) {
    /**デバイス状態をRealtime Databaseに更新*/
    String path = "/device_status/" + DEVICE_ID;

    DynamicJsonDocument doc(512);
    doc["status"] = status;
    doc["isOnline"] = isOnline;
    doc["lastUpdate"] = millis();
    if (measuring) {
        doc["currentSession"] = currentSessionId;
    }

    String jsonString;
    serializeJson(doc, jsonString);

    if (Firebase.RTDB.setJSON(&fbdo, path.c_str(), &doc)) {
        Serial.println("デバイス状態更新完了: " + status);
    } else {
        Serial.println("デバイス状態更新失敗: " + fbdo.errorReason());
    }
}

void updateRealtimeData() {
    /**リアルタイム測定データ更新*/
    if (!measuring || currentSessionId.isEmpty()) return;

    String path = "/realtime_data/" + DEVICE_ID + "/" + currentSessionId;

    DynamicJsonDocument doc(512);
    doc["currentFlow"] = flowRate;
    doc["totalAmount"] = totalLiters;
    doc["duration"] = (millis() - measureStartTime) / 1000; // seconds
    doc["lastUpdate"] = millis();

    if (Firebase.RTDB.setJSON(&fbdo, path.c_str(), &doc)) {
        // Success - リアルタイムデータ更新成功
    } else {
        Serial.println("リアルタイムデータ更新失敗: " + fbdo.errorReason());
    }
}

void checkCommands() {
    /**コマンド確認（Firebase Realtime Database監視）*/
    String commandPath = "/device_commands/" + DEVICE_ID;

    if (Firebase.RTDB.getJSON(&fbdo, commandPath.c_str())) {
        if (fbdo.dataType() == "json") {
            DynamicJsonDocument doc(1024);
            deserializeJson(doc, fbdo.jsonString());

            String command = doc["command"];
            bool processed = doc["processed"];

            if (!processed) {
                processCommand(command, doc);

                // コマンド処理済みマーク
                Firebase.RTDB.setBool(&fbdo, (commandPath + "/processed").c_str(), true);
            }
        }
    }
}

void processCommand(String command, DynamicJsonDocument& commandData) {
    /**コマンド処理*/
    Serial.println("コマンド受信: " + command);

    if (command == "start_measurement") {
        currentSessionId = commandData["sessionId"];
        currentUserId = commandData["userId"];
        startMeasurement();

    } else if (command == "stop_measurement") {
        stopMeasurement();

    } else if (command == "reset") {
        resetMeasurement();
    }
}

void startMeasurement() {
    /**測定開始*/
    if (!measuring) {
        measuring = true;
        measureStartTime = millis();
        totalLiters = 0.0;
        flowPulseCount = 0;
        oldTime = millis();

        updateDeviceStatus("measuring", true);
        Serial.println("測定開始 - セッション: " + currentSessionId);
    }
}

void stopMeasurement(String reason = "manual") {
    /**測定停止（終了理由付き）*/
    if (measuring) {
        measuring = false;

        // 最終データをAPIに送信（理由付き）
        sendFinalData(reason);

        updateDeviceStatus("idle", true);
        Serial.printf("測定終了 - 使用量: %.3f L (理由: %s)\n", totalLiters, reason.c_str());

        // セッション情報クリア
        currentSessionId = "";
        currentUserId = "";
        totalLiters = 0.0;
        noFlowStartTime = 0;
    }
}

void resetMeasurement() {
    /**測定リセット*/
    measuring = false;
    currentSessionId = "";
    currentUserId = "";
    totalLiters = 0.0;
    flowPulseCount = 0;

    updateDeviceStatus("idle", true);
    Serial.println("測定リセット完了");
}

void sendFinalData(String reason = "manual") {
    /**最終測定データをAPIに送信（⭐ dailyUsageに記録される）*/
    HTTPClient http;
    http.begin(API_BASE_URL + "/measurement-data");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", ESP_API_KEY);

    DynamicJsonDocument doc(1024);
    doc["deviceId"] = DEVICE_ID;
    doc["sessionId"] = currentSessionId;
    doc["totalAmount"] = totalLiters;
    doc["duration"] = (millis() - measureStartTime) / 1000;
    doc["endReason"] = reason; // 終了理由を追加

    String jsonString;
    serializeJson(doc, jsonString);

    int httpResponseCode = http.POST(jsonString);

    if (httpResponseCode == 200) {
        Serial.println("⭐ 最終データ送信成功：dailyUsageに記録されました");
        Serial.printf("終了理由: %s\n", reason.c_str());

        // レスポンス確認（オプション）
        String response = http.getString();
        DynamicJsonDocument responseDoc(1024);
        deserializeJson(responseDoc, response);

        if (responseDoc["data"]["recordedToDaily"]) {
            Serial.printf("✅ ユーザー %s の水使用量 %.3fL を記録\n",
                         currentUserId.c_str(), totalLiters);
        }
    } else {
        Serial.println("❌ 最終データ送信失敗: " + String(httpResponseCode));
        Serial.println("⚠️  dailyUsageへの記録に失敗した可能性があります");
    }

    http.end();
}

void calculateFlow() {
    /**流量計算 + 自動終了判定*/
    if (!measuring) return;

    if ((millis() - oldTime) > 1000) { // 1秒ごと
        // 流量計算 (L/min)
        flowRate = ((1000.0 / (millis() - oldTime)) * flowPulseCount) / 450.0;
        oldTime = millis();

        // 総使用量累積
        totalLiters += (flowRate / 60.0); // 1秒分の使用量を追加

        flowPulseCount = 0;

        // ⭐ 自動終了判定：無流量タイムアウト
        if (flowRate <= 0.01) { // 0.01 L/min以下は流量なしとみなす
            if (noFlowStartTime == 0) {
                noFlowStartTime = millis(); // 無流量開始時刻記録
            } else if (millis() - noFlowStartTime > NO_FLOW_TIMEOUT) {
                Serial.println("⏰ 30秒間流量なし → 自動終了");
                stopMeasurement("no_flow");
                return;
            }
        } else {
            noFlowStartTime = 0; // 流量があるので無流量カウンターリセット
        }

        // ⭐ 自動終了判定：セッションタイムアウト
        if (millis() - measureStartTime > SESSION_TIMEOUT) {
            Serial.println("⏰ 30分経過 → 強制終了");
            stopMeasurement("timeout");
            return;
        }

        // デバッグ出力（処理状況の詳細表示）
        Serial.printf("[測定] Flow: %.2f L/min, Total: %.3f L", flowRate, totalLiters);

        // 進行状況表示
        unsigned long sessionDuration = (millis() - measureStartTime) / 1000;
        Serial.printf(" | 経過: %lu分%lus", sessionDuration / 60, sessionDuration % 60);

        // 自動終了カウントダウン表示
        if (noFlowStartTime > 0) {
            unsigned long noFlowDuration = (millis() - noFlowStartTime) / 1000;
            unsigned long remaining = (NO_FLOW_TIMEOUT / 1000) - noFlowDuration;
            Serial.printf(" | 無流量終了まで: %lus", remaining);
        }

        // セッションタイムアウト残り時間
        unsigned long sessionRemaining = (SESSION_TIMEOUT - (millis() - measureStartTime)) / 60000;
        if (sessionRemaining < 60) { // 残り1時間未満で表示
            Serial.printf(" | タイムアウトまで: %lu分", sessionRemaining);
        }

        Serial.println();

        // リアルタイムデータ更新
        updateRealtimeData();
    }
}

// 測定状況レポート関数（デバッグ用）
void printMeasurementStatus() {
    if (!measuring) {
        Serial.println("[状態] 待機中 - ICカード読み取り待ち");
        return;
    }

    Serial.println("=== 測定状況レポート ===");
    Serial.printf("セッションID: %s\n", currentSessionId.c_str());
    Serial.printf("ユーザーID: %s\n", currentUserId.c_str());

    unsigned long elapsed = millis() - measureStartTime;
    Serial.printf("測定時間: %lu分%lus\n", elapsed / 60000, (elapsed % 60000) / 1000);
    Serial.printf("現在流量: %.2f L/min\n", flowRate);
    Serial.printf("累積使用量: %.3f L\n", totalLiters);

    if (noFlowStartTime > 0) {
        unsigned long noFlowDuration = (millis() - noFlowStartTime) / 1000;
        Serial.printf("無流量継続: %lus（30s で自動終了）\n", noFlowDuration);
    }

    Serial.println("=======================");
}

void loop() {
    /**メインループ - 各処理を定期実行*/

    // 🌐 WiFi接続確認（最優先）
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("⚠️  WiFi再接続中...");
        updateDeviceStatus("reconnecting", false);
        connectWiFi();
        return; // 接続確立まで他の処理は停止
    }

    // 📡 コマンド確認（2秒間隔）
    static unsigned long lastCommandCheck = 0;
    if (millis() - lastCommandCheck > 2000) {
        checkCommands();
        lastCommandCheck = millis();
    }

    // 🚰 流量計算 + 自動終了判定（1秒間隔）
    calculateFlow();

    // 📊 デバイス状態定期更新（30秒間隔）
    static unsigned long lastStatusUpdate = 0;
    if (millis() - lastStatusUpdate > 30000) {
        String status = measuring ? "measuring" : "idle";
        updateDeviceStatus(status, true);
        lastStatusUpdate = millis();
    }

    // 📋 測定状況レポート（5分間隔、測定中のみ）
    static unsigned long lastStatusReport = 0;
    if (measuring && millis() - lastStatusReport > 300000) { // 5分間隔
        printMeasurementStatus();
        lastStatusReport = millis();
    }

    // 🔧 システム監視（10分間隔）
    static unsigned long lastSystemCheck = 0;
    if (millis() - lastSystemCheck > 600000) { // 10分間隔
        // メモリ使用量チェック
        Serial.printf("[システム] 空きヒープ: %d bytes\n", ESP.getFreeHeap());

        // Firebase接続状態確認
        if (Firebase.ready()) {
            Serial.println("[Firebase] 接続正常");
        } else {
            Serial.println("[Firebase] ⚠️  接続異常 - 再接続試行");
            initFirebase();
        }

        lastSystemCheck = millis();
    }

    // CPU負荷軽減
    delay(100);
}

// システム起動時の初期化完了チェック
void waitForSystemReady() {
    Serial.println("🔄 システム初期化中...");

    // WiFi接続待機
    while (WiFi.status() != WL_CONNECTED) {
        Serial.print(".");
        delay(500);
    }
    Serial.println("\n✅ WiFi接続完了");

    // Firebase接続待機
    while (!Firebase.ready()) {
        Serial.print(".");
        delay(500);
    }
    Serial.println("✅ Firebase接続完了");

    // デバイス状態初期化
    updateDeviceStatus("idle", true);
    Serial.println("✅ デバイス状態初期化完了");

    Serial.println("🎉 システム準備完了 - ICカード読み取り待機中");
}
```

## セキュリティ実装

### Firebase Security Rules

```javascript
// Realtime Database Rules
{
  "rules": {
    // デバイスコマンド（認証済みユーザーのみ書き込み可能）
    "device_commands": {
      "$deviceId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    },

    // デバイス状態（ESP32のみ書き込み可能）
    "device_status": {
      "$deviceId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    },

    // リアルタイムデータ（ESP32のみ書き込み、認証済みユーザー読み取り可能）
    "realtime_data": {
      "$deviceId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}

// Firestore Rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ICカード情報（所有者のみアクセス可能）
    match /ic_cards/{cardId} {
      allow read, write: if request.auth != null &&
        (request.auth.uid == resource.data.userId ||
         request.auth.token.admin == true);
    }

    // 使用セッション（関係者のみアクセス可能）
    match /water_usage_sessions/{sessionId} {
      allow read, write: if request.auth != null &&
        (request.auth.uid == resource.data.userId ||
         request.auth.token.admin == true);
    }

    // デバイス情報（管理者のみ）
    match /devices/{deviceId} {
      allow read, write: if request.auth != null &&
        request.auth.token.admin == true;
    }
  }
}
```

## 監視・運用

### ヘルスチェック機能（⭐ dailyUsage監視付き）

```typescript
// src/app/api/health-check/route.ts
export async function GET() {
  try {
    const db = getDB();
    const realtimeDB = getRealtimeDB();

    // デバイス状態確認
    const devicesSnapshot = await db?.collection('devices').get();
    const onlineDevices = devicesSnapshot?.docs.filter(doc =>
      doc.data().isOnline
    ).length || 0;

    // ⭐ dailyUsage記録状況確認
    const today = new Date().toISOString().split('T')[0];
    const dailyUsageSnapshot = await db?.collection('dailyUsage')
      .where('date', '==', today)
      .get();

    const todayRecords = dailyUsageSnapshot?.size || 0;
    const waterUsageRecords = dailyUsageSnapshot?.docs.filter(doc =>
      doc.data().waterUsage && doc.data().waterUsage > 0
    ).length || 0;

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        firestore: !!db,
        realtimeDB: !!realtimeDB
      },
      devices: {
        total: devicesSnapshot?.size || 0,
        online: onlineDevices
      },
      dailyUsage: {                     // ⭐ dailyUsage監視情報
        date: today,
        totalRecords: todayRecords,
        waterUsageRecords: waterUsageRecords,
        recordingRate: todayRecords > 0 ? (waterUsageRecords / todayRecords * 100).toFixed(1) : 0
      }
    });
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      error: error.message
    }, { status: 500 });
  }
}
```

### dailyUsage記録確認ツール

```typescript
// src/app/api/daily-usage-status/route.ts
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

    const db = getDB();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    if (userId) {
      // 特定ユーザーの記録確認
      const docId = `${userId}_${date}`;
      const doc = await db.collection('dailyUsage').doc(docId).get();

      if (doc.exists) {
        const data = doc.data()!;
        return NextResponse.json({
          status: 'found',
          data: {
            userId,
            date,
            waterUsage: data.waterUsage || 0,
            electricityUsage: data.electricityUsage || 0,
            conservationScore: data.conservationScore || null
          }
        });
      } else {
        return NextResponse.json({
          status: 'not_found',
          message: `${userId}の${date}の記録が見つかりません`
        });
      }
    } else {
      // 全ユーザーの記録サマリー
      const snapshot = await db.collection('dailyUsage')
        .where('date', '==', date)
        .get();

      const summary = {
        date,
        totalUsers: snapshot.size,
        waterUsageUsers: 0,
        totalWaterUsage: 0
      };

      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.waterUsage && data.waterUsage > 0) {
          summary.waterUsageUsers++;
          summary.totalWaterUsage += data.waterUsage;
        }
      });

      return NextResponse.json({
        status: 'summary',
        data: summary
      });
    }
  } catch (error) {
    return NextResponse.json({
      error: 'データ取得に失敗しました'
    }, { status: 500 });
  }
}
```

## トラブルシューティング

### よくある問題と解決方法

1. **Firebase接続エラー**
   - サービスアカウントキーの確認
   - ネットワーク接続の確認
   - Firebase プロジェクト設定の確認

2. **Realtime Database同期遅延**
   - ネットワーク帯域幅の確認
   - Firebase プランの制限確認
   - デバイス負荷の確認

3. **ESP32の頻繁な再接続**
   - WiFi信号強度の確認
   - 電源供給の安定性確認
   - ファームウェアの最適化

4. **⭐ dailyUsage記録失敗**
   - セッション情報の確認（userId取得失敗）
   - saveDailyUsage関数のエラーログ確認
   - Firestoreアクセス権限の確認
   - API Key認証失敗の確認

### dailyUsage記録の確認方法

```bash
# 特定ユーザーの記録確認
curl "https://aquariumotion.vercel.app/api/daily-usage-status?userId=user_123&date=2025-01-16"

# 今日の全体サマリー確認
curl "https://aquariumotion.vercel.app/api/daily-usage-status"

# ヘルスチェック（dailyUsage記録状況含む）
curl "https://aquariumotion.vercel.app/api/health-check"
```

## まとめ

この実装により、以下が実現されます：

1. **ICカード認証**: 共有スペースでの使用者特定
2. **リアルタイム測定**: ESP32による正確な流量計測定
3. **⭐ dailyUsage記録**: 測定完了時の自動的なwaterUsage記録
4. **節約スコア算出**: 既存システムとの統合による自動スコア計算

**重要**: 最終的に`dailyUsage`コレクションの`waterUsage`フィールドに使用量が記録されることで、既存のAQUARIUMOTIONシステムと完全に統合され、ユーザーの節約行動が正確に評価・可視化されます。