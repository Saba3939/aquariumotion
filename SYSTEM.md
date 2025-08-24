---
## プロジェクト「AQUARIUMOTION」実装仕様書 v1.0

### 1. 概要
#### 1.1. プロジェクト名
あくありうもーしょん (AQUARIUMOTION)

#### 1.2. 目的
寮生活を送る学生を対象に、日々の節水・節電行動を可視化・ゲーミフィケーション化することで、楽しみながら省エネ行動を促進・習慣化させる。

#### 1.3. ターゲットユーザー
寮で共同生活を送る学生

#### 1.4. コアコンセプト
ユーザーの省エネ行動（Motion）が、バーチャル水槽の環境変化や魚の育成に繋がり、達成感や愛着といった感情（Emotion）を喚起する。

***
### 2. システムアーキテクチャ
#### 2.1. 全体構成図
`ハードウェア(ESP32)` → `Vercel API` → `Firebase (DB)` ↔ `Next.js (Webアプリ)` ↔ `Unity (ビジュアル)`

#### 2.2. 使用技術スタック
| 領域 | 技術 | 役割 |
| :--- | :--- | :--- |
| **フロントエンド** | Next.js | Webアプリ本体のUI、ページ遷移、APIとの通信 |
| **ビジュアル** | Unity (WebGL) | `me水槽`の3D描画。Next.jsアプリ内に埋め込む |
| **バックエンド** | Vercel | Serverless Functions (API), Cron Jobs (定時実行), ホスティング |
| **データベース** | Firebase Firestore | 全てのデータ保存 |
| **ハードウェア** | ESP32 | 水・電気使用量の計測とAPIへのデータ送信 |

***
### 3. 主要機能仕様
#### 3.1. me水槽 (Personal Aquarium)
ユーザー個人の省エネ行動を反映するバーチャル水槽。`environmentLevel`に応じて、水の色、透明度（フォグ）、環境光がリアルタイムに変化する。

#### 3.2. Link水槽 (Shared Aquarium)
フロア全体の省エネ達成度を共有スペースにプロジェクションマッピングで投影する。

#### 3.3. ゲームサイクル（魚の育成フロー）
1.  **データ計測:** ESP32が水・電気使用量を計測し、`log-usage`APIへ送信。データは`dailyUsage`コレクションに記録される。
2.  **日次集計 (自動):** 毎日深夜0時(JST)にVercel Cron Jobが`daily-aggregation`APIを実行。
3.  **メーター蓄積:** APIが各ユーザーの前日の節約スコアを算出し、`aquariums`ドキュメントの`conservationMeter`に加算する。
4.  **自動餌やり:** `conservationMeter`が規定値（例: 100）を超えるたびに、育成中の**全魚**の`eggMeter`が`+1`される。`conservationMeter`は消費した分だけ減少する。
5.  **たまご生成:** いずれかの魚の`eggMeter`が`3`に達すると、その魚はたまごを産む。`aquariums`の`unhatchedEggCount`が`+1`され、その魚の`eggMeter`は`0`にリセットされる。
6.  **たまご開封:** ユーザーが`hatch-egg`APIを呼び出すと、`unhatchedEggCount`を`1`消費して新しい魚が`fish`サブコレクションに追加される。

***
### 4. API仕様 (Vercel Serverless Functions)
#### 4.1. `POST /api/log-usage`
* **目的:** ハードウェアからの使用量データを受け取り、記録する。
* **認証:** `X-API-KEY`ヘッダーによる共有シークレットキー認証。
* **リクエスト:** `{ "userId": "...", "usageType": "water" | "electricity", "amount": 15.5 }`
* **処理:** `dailyUsage`コレクションに対応する日のドキュメントを作成・更新する。

#### 4.2. `POST /api/hatch-egg`
* **目的:** ユーザーが所有するたまごを開封し、新しい魚を生成する。
* **認証:** Firebase Auth IDトークン (`Authorization: Bearer <token>`)。
* **リクエスト:** `{}`
* **処理:** `unhatchedEggCount > 0`を確認し、`fish`サブコレクションに新しい魚を追加後、`unhatchedEggCount`を`-1`する。

#### 4.3. `GET /api/cron/daily-aggregation`
* **目的:** 1日1回、全ユーザーのデータ集計とゲームロジックの更新を行う。
* **認証:** Vercel Cron Jobからのみ実行。
* **処理:** 上記「3.3. ゲームサイクル」の2〜5を実行する。

***
### 5. データベース設計 (Firestore)
* **/aquariums/{uid}**
    * `unhatchedEggCount` (number): 未開封のたまごの数。
    * `conservationMeter` (number): 節約メーターの現在の値。
    * `environmentLevel` (number): 環境レベル (0-100)。
    * **/fish/{fishId}** (サブコレクション)
        * `type_id` (string): 魚の種類のID。
        * `fish_name` (string): 魚の名前。
        * `status` (string): `raising` | `inLinkAquarium`
        * `eggMeter` (number): 0, 1, 2, 3 の4段階。

***
### 6. デザイン仕様
#### 6.1. ロゴ
水滴と稲妻、ピクセルアートの魚、ポジティブな循環の3案を検討中。

#### 6.2. Unityビジュアル
| 環境値 (Level) | 水の色 | フォグ終了距離 | 環境光の色 |
| :--- | :--- | :--- | :--- |
| 0 | `#544C2B` (濁) | `25` (近) | `#A9A47C` (黄) |
| 50 | `#002A87` (標準) | `60` (中) | `(中間色)` |
| 100 | `#00BFFF` (澄) | `150` (遠) | `#AACCFF` (水) |
