# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

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

## Architecture Overview

このプロジェクトは、環境保護行動を促進するバーチャル水族館アプリ「AQUARIUMOTION」です。

### Core Architecture

**Frontend**: Next.js 15 (App Router) + React 19 + TypeScript
- `src/app/page.tsx` - メインページ（認証、水族館表示、UI管理）
- `src/components/unitycomponent.tsx` - Unity WebGL統合コンポーネント
- `src/components/ui/` - Radix UI基盤の再利用可能コンポーネント

**Backend**: Next.js API Routes + Firebase
- `src/app/api/` - REST APIエンドポイント
- `src/lib/firebase.ts` - Firebaseクライアント設定
- `src/lib/firebase-server.ts` - Firebase Admin設定

**Unity Integration**: Unity WebGLによる3D水族館
- `public/Build/` - Unityビルドファイル
- React ↔ Unity間のリアルタイムJSONデータ交換

### Key Data Models

```typescript
// src/app/page.tsx で定義
interface Fish {
  id: string;
  type_id: number;
  fish_name: string;
  status: string;
  eggMeter: number;
  growthLevel: number;
  birthDate: Timestamp;
}

interface Aquarium {
  enviromentLevel: number;
  conservationMeter: number;
  lastUpdated: Timestamp;
}
```

### Firebase Data Structure

- `aquariums/{userId}` - ユーザーの水族館データ
- `aquariums/{userId}/fish/{fishId}` - 各魚のデータ
- `dailyUsage/{userId}_{date}` - 日別使用量・節約スコア

### Unity Integration Pattern

1. **データフロー**: React state → JSON文字列 → Unity sendMessage
2. **送信タイミング**: Unity読み込み完了時 + データ更新時
3. **送信先**: "GameManager" GameObject の "ReceiveAquariumData", "ReceiveFishData" メソッド

### API Authentication

API呼び出しは `x-api-key` ヘッダーまたは Firebase ID Token認証を使用。

## Development Guidelines

- **言語**: コメントは日本語、コードは英語
- **スタイル**: TailwindCSS + カスタムCSSカラーパレット
- **型安全性**: TypeScript strict mode、Firebase Timestampの適切な変換処理
- **状態管理**: React useState、Firebase認証状態の監視

## Task Completion Checklist

タスク完了時は以下を実行：
1. `npm run lint`
2. `npx tsc --noEmit`

### Voice Notification Rules

- **全てのタスク完了時には必ずVOICEVOXの音声通知機能を使用すること**
- **重要なお知らせやエラー発生時にも音声通知を行うこと**
- **音声通知の設定: speaker=1, speedScale=1.3を使用すること**
- **英単語は適切にカタカナに変換してVOICEVOXに送信すること**
- **VOICEVOXに送信するテキストは不要なスペースを削除すること**
- **1回の音声通知は100文字以内でシンプルに話すこと**
- **以下のタイミングで細かく音声通知を行うこと：**
  - 命令受領時: 「了解です」「承知しました」
  - 作業開始時: 「〜を開始します」  
  - 作業中: 「調査中です」「修正中です」
  - 進捗報告: 「半分完了です」「もう少しです」
  - 完了時: 「完了です」「修正完了です」
- **詳しい技術的説明は音声通知に含めず、結果のみを簡潔に報告すること**
