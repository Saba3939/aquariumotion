# 01. API実装: POST /api/log-usage

## 概要
ハードウェア（ESP32）からの水・電気使用量データを受け取り、Firebase Firestoreに記録するAPIエンドポイント。

## 仕様
- **エンドポイント**: `POST /api/log-usage`
- **認証**: `X-API-KEY`ヘッダーによる共有シークレットキー認証
- **リクエスト形式**:
  ```json
  {
    "userId": "user123",
    "usageType": "water" | "electricity", 
    "amount": 15.5
  }
  ```

## 実装要件
1. リクエスト検証（userId, usageType, amount必須）
2. API-KEY認証の実装
3. `dailyUsage`コレクションへのデータ保存
4. エラーハンドリング
5. レスポンス返却

## データ保存先
`dailyUsage/{userId}_{YYYY-MM-DD}`

## ステータス
- [ ] 実装開始
- [ ] 認証機能実装
- [ ] データ保存機能実装
- [ ] テスト完了