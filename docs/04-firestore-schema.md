# 04. Firestoreデータモデル実装

## 概要
Firebase Firestoreのコレクション・ドキュメント構造を仕様通りに実装・検証。

## データベース構造

### aquariums/{uid}
```typescript
interface Aquarium {
  unhatchedEggCount: number;     // 未開封のたまごの数
  conservationMeter: number;     // 節約メーター値
  environmentLevel: number;      // 環境レベル (0-100)
  lastUpdated: Timestamp;        // 最終更新日時
}
```

### aquariums/{uid}/fish/{fishId}
```typescript
interface Fish {
  type_id: string;              // 魚の種類ID
  fish_name: string;            // 魚の名前
  status: 'raising' | 'inLinkAquarium';  // 飼育状態
  eggMeter: number;             // たまごメーター (0-3)
  growthLevel: number;          // 成長レベル
  birthDate: Timestamp;         // 生年月日
}
```

### dailyUsage/{userId}_{YYYY-MM-DD}
```typescript
interface DailyUsage {
  userId: string;
  date: string;
  waterUsage?: number;
  electricityUsage?: number;
  conservationScore?: number;   // 計算された節約スコア
}
```

## 実装要件
1. TypeScript型定義作成
2. Firestore Rules設定
3. データ初期化関数
4. CRUD操作ユーティリティ関数

## ステータス
- [ ] 型定義作成
- [ ] Firestore Rules設定
- [ ] ユーティリティ関数実装
- [ ] テストデータ作成