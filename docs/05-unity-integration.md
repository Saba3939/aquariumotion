# 05. Unity統合機能実装

## 概要
React ↔ Unity WebGL間でのリアルタイムJSONデータ通信機能を実装。

## データフロー
React state → JSON文字列 → Unity sendMessage() → GameManager

## 送信データ

### 水族館データ
```typescript
interface AquariumData {
  environmentLevel: number;      // 0-100で水の色・フォグ・環境光を制御
  conservationMeter: number;
  unhatchedEggCount: number;
}
```

### 魚データ
```typescript
interface FishData {
  fish: Fish[];                 // 魚の配列
}
```

## Unity側受信メソッド
- **GameObject**: "GameManager"
- **メソッド**: "ReceiveAquariumData", "ReceiveFishData"

## 実装要件
1. UnityComponentでのsendMessage実装
2. Unity読み込み完了時の初回データ送信
3. Reactステート更新時の自動送信
4. エラーハンドリング
5. 送信ログ機能

## 環境レベル対応表
| Level | 水の色 | フォグ距離 | 環境光 |
|-------|--------|------------|---------|
| 0     | #544C2B| 25         | #A9A47C |
| 50    | #002A87| 60         | 中間色   |
| 100   | #00BFFF| 150        | #AACCFF |

## ステータス
- [ ] sendMessage実装
- [ ] データ送信タイミング制御
- [ ] エラーハンドリング実装
- [ ] Unity連携テスト