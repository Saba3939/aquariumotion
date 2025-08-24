# 13. データ検証・エラーハンドリング

## 概要
API入力データの検証、型安全性の確保、包括的なエラーハンドリングシステムを実装。

## 検証要件

### API入力検証
1. **log-usage API**
   - userId: 必須、文字列、空でない
   - usageType: 必須、"water" | "electricity"
   - amount: 必須、正の数値

2. **hatch-egg API**
   - Authorization: 必須、有効なIDトークン
   - ユーザー存在確認

3. **共通検証**
   - Content-Type: application/json
   - リクエストサイズ制限
   - レート制限

### データ型検証
1. TypeScript型定義の厳密化
2. Zod等のランタイム検証ライブラリ使用
3. Firebase Timestamp適切な変換
4. 数値範囲の検証

## エラーハンドリング
1. **APIエラーレスポンス統一**
   ```json
   {
     "success": false,
     "error": "INVALID_INPUT",
     "message": "使用量は正の数値である必要があります",
     "code": 400
   }
   ```

2. **フロントエンドエラー表示**
   - トースト通知
   - フォームエラー表示
   - 再試行機能

## ステータス
- [ ] 入力検証関数実装
- [ ] エラーレスポンス統一
- [ ] フロントエンドエラーUI
- [ ] ログ機能実装
- [ ] テスト・検証