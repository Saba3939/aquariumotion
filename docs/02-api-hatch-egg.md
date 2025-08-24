# 02. API実装: POST /api/hatch-egg

## 概要
ユーザーが所有するたまごを開封し、新しい魚を生成するAPIエンドポイント。

## 仕様
- **エンドポイント**: `POST /api/hatch-egg`
- **認証**: Firebase Auth IDトークン (`Authorization: Bearer <token>`)
- **リクエスト形式**: `{}`（空オブジェクト）

## 実装要件
1. Firebase Auth IDトークン検証
2. ユーザーの`unhatchedEggCount > 0`確認
3. 新しい魚を`fish`サブコレクションに追加
4. `unhatchedEggCount`を`-1`
5. 魚の属性設定（type_id, fish_name, status, eggMeter）

## データ更新
- `aquariums/{uid}/unhatchedEggCount` を減算
- `aquariums/{uid}/fish/{fishId}` を新規作成

## ステータス
- [ ] 実装開始
- [ ] 認証機能実装
- [ ] たまご開封ロジック実装
- [ ] 魚生成ロジック実装
- [ ] テスト完了