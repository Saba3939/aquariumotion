# AQUARIUMOTION

環境保護行動を促進するバーチャル水族館アプリケーション

## 概要

AQUARIUMOTIONは、ユーザーの環境保護活動（節電・節水・CO2削減など）を可視化し、バーチャル水族館として表現するWebアプリケーションです。ユーザーの行動に応じて水族館が成長し、新しい魚が生まれます。

## 技術スタック

- **フロントエンド**: Next.js 15 (App Router) + React 19 + TypeScript
- **スタイリング**: TailwindCSS + Radix UI
- **バックエンド**: Next.js API Routes + Firebase
- **3D表示**: Unity WebGL
- **データベース**: Firebase Firestore
- **認証**: Firebase Authentication

## セットアップ

### 必要な環境

- Node.js 18以上
- npm または yarn

### インストール

```bash
# 依存関係のインストール
npm install
```

### 環境変数

プロジェクトルートに`.env.local`ファイルを作成し、Firebase設定を追加してください：

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

## 開発コマンド

```bash
# 開発サーバー起動（Turbopack使用）
npm run dev

# ビルド
npm run build

# プロダクション起動
npm start

# リンター実行
npm run lint

# TypeScriptコンパイルチェック
npx tsc --noEmit
```

開発サーバーは [http://localhost:3000](http://localhost:3000) で起動します。

## プロジェクト構成

```
src/
├── app/
│   ├── page.tsx              # メインページ（認証・水族館表示・UI管理）
│   ├── api/                  # API Routes
│   │   ├── calculate-score/  # スコア計算API
│   │   ├── check-egg/        # 卵生成チェックAPI
│   │   └── update-fish/      # 魚更新API
│   └── globals.css           # グローバルスタイル
├── components/
│   ├── unitycomponent.tsx    # Unity WebGL統合コンポーネント
│   ├── aquarium-level.tsx    # 水族館レベル表示
│   ├── device-manager.tsx    # デバイス管理UI
│   ├── fish-status.tsx       # 魚のステータス表示
│   ├── login-screen.tsx      # ログイン画面
│   └── ui/                   # 再利用可能UIコンポーネント
└── lib/
    ├── firebase.ts           # Firebaseクライアント設定
    └── firebase-server.ts    # Firebase Admin設定

public/
└── Build/                    # Unityビルドファイル
```

## データモデル

### Fish (魚)

```typescript
interface Fish {
  id: string;
  type_id: number;
  fish_name: string;
  status: string;
  eggMeter: number;
  growthLevel: number;
  birthDate: Timestamp;
}
```

### Aquarium (水族館)

```typescript
interface Aquarium {
  enviromentLevel: number;
  conservationMeter: number;
  lastUpdated: Timestamp;
}
```

## Unity統合

### データフロー

1. React stateでデータ管理
2. データをJSON文字列に変換
3. Unity WebGLの`sendMessage`メソッドで送信
4. Unity側で3D水族館を描画

### 送信タイミング

- Unity読み込み完了時
- 魚データ更新時
- 水族館レベル更新時

### Unity側のメソッド

- `GameManager.ReceiveAquariumData(jsonString)` - 水族館データ受信
- `GameManager.ReceiveFishData(jsonString)` - 魚データ受信

## Firebase構成

### Firestoreデータ構造

```
aquariums/{userId}
  - enviromentLevel: number
  - conservationMeter: number
  - lastUpdated: Timestamp

  fish/{fishId}
    - type_id: number
    - fish_name: string
    - status: string
    - eggMeter: number
    - growthLevel: number
    - birthDate: Timestamp

dailyUsage/{userId}_{date}
  - electricity: number
  - water: number
  - savingsScore: number
```

## API認証

API呼び出しには以下のいずれかの認証方法を使用：

- `x-api-key` ヘッダー
- Firebase ID Token（Authorizationヘッダー）


