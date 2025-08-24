# Phase2 セットアップガイド

## 概要
Phase2で実装した自動化・バックエンドロジックの設定方法と運用手順を説明します。

## 必須設定項目

### 1. 環境変数設定

#### 開発環境（.env.local）
```bash
# Phase2で新たに追加が必要
CRON_SECRET=your_secure_cron_secret_here

# Phase1から継続（既存設定）
GOOGLE_SERVICE_ACCOUNT={"type":"service_account",...}
ESP32_API_KEY=your_secure_api_key_here
```

#### 本番環境（Vercel）
1. Vercel ダッシュボード → Settings → Environment Variables
2. 以下の環境変数を追加:
   - `CRON_SECRET`: 強固なランダム文字列（32文字以上推奨）

### 2. Cron Job設定確認

#### vercel.json設定
```json
{
  "crons": [
    {
      "path": "/api/cron/daily-aggregation",
      "schedule": "0 15 * * *"
    }
  ]
}
```

**実行タイミング**: 毎日15:00 UTC（日本時間00:00）

## デプロイ手順

### 1. 事前準備
```bash
# TypeScriptエラーチェック
npx tsc --noEmit

# リンター実行
npm run lint

# ビルドテスト
npm run build
```

### 2. Vercelデプロイ
```bash
# Vercelにデプロイ
vercel --prod

# 環境変数設定確認
vercel env ls
```

### 3. デプロイ後確認
1. Vercel ダッシュボード → Functions → Cron Jobs
2. `/api/cron/daily-aggregation` が表示されることを確認
3. 実行スケジュールが `0 15 * * *` であることを確認

## 動作テスト

### 1. 手動テスト（開発環境）
```bash
# 認証エラーテスト
curl -X GET "http://localhost:3000/api/cron/daily-aggregation"
# → 401エラーが返ることを確認

# 正しい認証でのテスト（CRON_SECRETを設定後）
curl -X GET "http://localhost:3000/api/cron/daily-aggregation" \
  -H "Authorization: Bearer your_cron_secret"
```

### 2. 節約スコア計算テスト
Phase2実装時に作成したテストスクリプトを使用:
```javascript
// 各種使用量パターンでのスコア計算確認
// - 使用量0 → 100点
// - 基準値50% → 50点
// - 基準値同等 → 0点
```

## 運用監視

### 1. ログ監視
```bash
# Vercelログ確認
vercel logs

# エラーログのフィルタリング
vercel logs --filter="error"
```

### 2. 実行結果確認項目
- **processedUsers**: 処理対象ユーザー数
- **scoredUsers**: スコア計算完了ユーザー数  
- **fedFish**: 餌やり処理された魚の数
- **newEggs**: 新たに生成されたたまごの数
- **errors**: エラー発生ユーザー一覧

### 3. アラート設定
Vercel Integration経由でSlack/Email通知設定推奨:
- Cron Job実行失敗時
- 大量エラー発生時
- 処理時間異常時

## トラブルシューティング

### よくある問題

#### 1. Cron Job実行されない
**原因**: 
- CRON_SECRET未設定
- vercel.json構文エラー
- デプロイ反映遅延

**対処**:
```bash
# 設定確認
vercel env ls

# 再デプロイ
vercel --prod --force
```

#### 2. 認証エラー（401）
**原因**: 
- CRON_SECRET不一致
- Authorization ヘッダー形式エラー

**対処**:
- 環境変数値の確認
- Bearer Token形式の確認

#### 3. Firestore書き込みエラー
**原因**:
- Firebase Admin SDK設定不備
- 権限不足
- ネットワークタイムアウト

**対処**:
```bash
# Firebase設定確認
echo $GOOGLE_SERVICE_ACCOUNT | jq .

# 権限確認（Firebase Console）
```

#### 4. バッチ処理タイムアウト
**原因**: 
- 大量ユーザーデータ処理
- Vercel Function制限（10秒）

**対処**:
- バッチサイズ調整（現在450件/バッチ）
- 処理対象日付の分割実行検討

## メンテナンス

### 1. 基準値調整
`src/lib/conservation-score.ts`の基準値更新:
```typescript
export const BASELINE_CONFIG = {
  WATER: 100,        // 調整可能
  ELECTRICITY: 5,    // 調整可能
} as const;
```

### 2. スケジュール変更
`vercel.json`のcron設定更新:
```json
{
  "schedule": "0 15 * * *"  // UTC時刻で指定
}
```

### 3. バッチサイズ最適化
大量ユーザー対応時の調整:
```typescript
// バッチサイズ制限（現在450件）
if (batchCount >= 450) {
  await batch.commit();
  batchCount = 0;
}
```

## セキュリティ考慮事項

### 1. CRON_SECRET管理
- 32文字以上のランダム文字列使用
- 定期的なローテーション推奨
- Git履歴への記録避ける

### 2. IPアドレス制限
将来的な検討項目:
- Vercel IP範囲からのアクセスのみ許可
- 追加の認証レイヤー実装

### 3. ログセキュリティ
- 個人情報のログ出力避ける
- エラーメッセージの適切なマスキング

## パフォーマンス最適化

### 1. 現在の最適化
- バッチ書き込み（450件/バッチ）
- エラー時の個別処理継続
- 必要最小限のデータ取得

### 2. 将来の改善案
- Redis キャッシュ導入
- 並列処理の検討
- インデックス最適化

Phase2の自動化機能により、毎日定時にユーザーの節約行動がゲームに反映される仕組みが完成しました。適切な設定と監視により、安定した運用が可能です。