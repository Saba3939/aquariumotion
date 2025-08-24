# 17. Link水槽魚選択システム実装

## 概要
ユーザーが自分の魚をLink水槽（共有空間のプロジェクションマッピング）で泳がせるための選択・管理システムを実装。

## 機能要件

### 魚選択システム
1. **選択可能魚一覧**: `status: 'raising'`の魚を表示
2. **Link水槽への移動**: 選択した魚を`status: 'inLinkAquarium'`に変更
3. **個人水槽への呼び戻し**: Link水槽の魚を個人水槽に戻す
4. **同時表示制限**: Link水槽での同時表示数制限（例: 1匹まで）

### API エンドポイント
1. **POST /api/move-fish-to-link** - 魚をLink水槽に移動
   ```json
   {
     "fishId": "fish123"
   }
   ```

2. **POST /api/recall-fish-from-link** - 魚を個人水槽に呼び戻し
   ```json
   {
     "fishId": "fish123"  
   }
   ```

3. **GET /api/link-aquarium/fish** - Link水槽の全魚取得
   - フロア全体の共有魚データ

## データベース更新

### 魚ステータス管理
```typescript
// 魚の状態遷移
'raising' ⇄ 'inLinkAquarium'

// 追加フィールド（必要に応じて）
interface Fish {
  // 既存フィールド...
  linkAquariumEntryDate?: Timestamp;  // Link水槽参加日時
  linkDisplayOrder?: number;          // Link水槽での表示順序
}
```

### Link水槽管理コレクション
```typescript
// linkAquarium/{floorId} 
interface LinkAquarium {
  activeFish: string[];        // 現在Link水槽にいる魚ID配列
  maxFishCount: number;        // 最大同時表示数
  lastUpdated: Timestamp;
}
```

## UI実装要件

### 魚選択UI
1. **個人水槽魚一覧**: raising状態の魚を表示
2. **Link水槽選択ボタン**: 「Link水槽で泳がせる」ボタン
3. **呼び戻しボタン**: Link水槽の魚を呼び戻すボタン
4. **状態表示**: 現在どこで泳いでいるかの視覚的表示

### Link水槽表示UI
1. **共有魚一覧**: 現在Link水槽で泳ぐ全ユーザーの魚
2. **オーナー表示**: 各魚の飼い主情報（匿名化）
3. **リアルタイム更新**: 他ユーザーの魚移動をリアルタイム反映

## Unity連携
Link水槽の魚データをUnityに送信し、プロジェクションマッピングで表示
```json
{
  "linkAquariumFish": [
    {
      "fishId": "fish123",
      "type_id": "001", 
      "ownerDisplayName": "ユーザー1"
    }
  ]
}
```

## ステータス
- [ ] API エンドポイント実装
- [ ] データベーススキーマ拡張
- [ ] 魚選択UI実装
- [ ] Link水槽表示UI実装
- [ ] リアルタイム更新機能
- [ ] Unity連携実装
- [ ] テスト・検証