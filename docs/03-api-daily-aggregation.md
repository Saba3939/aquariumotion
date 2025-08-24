# 03. API実装: GET /api/cron/daily-aggregation

## 概要
毎日深夜0時(JST)にVercel Cron Jobで実行される日次集計・ゲームロジック更新API。

## 仕様
- **エンドポイント**: `GET /api/cron/daily-aggregation`
- **認証**: Vercel Cron Jobからのみ実行
- **実行頻度**: 1日1回（深夜0時JST）

## 実装要件
1. 全ユーザーの前日節約スコア算出
2. `conservationMeter`への加算
3. 自動餌やりロジック（conservationMeter ≥ 100で全魚のeggMeter +1）
4. たまご生成ロジック（eggMeter = 3で unhatchedEggCount +1）
5. バッチ処理でのFirestore更新

## 処理フロー
1. 全ユーザーの`dailyUsage`データ取得
2. 節約スコア計算・conservationMeter更新
3. 餌やり処理（conservationMeter消費）
4. たまご生成処理
5. 結果ログ出力

## ステータス
- [ ] 実装開始
- [ ] データ取得ロジック実装
- [ ] 節約スコア計算実装
- [ ] ゲームロジック実装
- [ ] Cron Job設定
- [ ] テスト完了