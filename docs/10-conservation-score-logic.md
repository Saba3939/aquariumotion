# 10. 節約スコア計算ロジック実装

## 概要
ユーザーの水・電気使用量から節約スコアを算出するロジックを実装。

## 計算仕様
節約スコア = 基準使用量に対する削減率に基づいてポイント化

### 計算式（案）
```typescript
// 基準値設定（寮生活平均値）
const BASELINE_WATER = 100;        // リットル/日
const BASELINE_ELECTRICITY = 5;     // kWh/日

// 削減率計算
const waterReduction = Math.max(0, (BASELINE_WATER - actualUsage) / BASELINE_WATER);
const electricityReduction = Math.max(0, (BASELINE_ELECTRICITY - actualUsage) / BASELINE_ELECTRICITY);

// スコア計算（0-100点）
const conservationScore = Math.round((waterReduction + electricityReduction) * 50);
```

## 実装要件
1. 基準値の設定・管理
2. 使用量データの取得・集計
3. 削減率計算ロジック
4. スコア算出・正規化
5. 履歴データ保存

## API統合
- `daily-aggregation` APIでの自動計算
- `calculate-conservation-score` APIでの手動計算
- スコア履歴の蓄積

## ステータス
- [ ] 計算式設計・実装
- [ ] 基準値管理機能
- [ ] API統合
- [ ] 履歴機能実装
- [ ] テスト・調整