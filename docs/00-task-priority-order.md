# タスク優先順位・実行順序

## Phase 1: ESP・ハードウェア基盤 ✅ 完了 (2025/01/15)
1. **04-firestore-schema.md** - データベース設計（デバイス・使用量データ構造） ✅
2. **09-firebase-admin-setup.md** - Firebase Admin SDK設定 ✅
3. **16-device-registration.md** - デバイス登録システム ✅ **新規完了**
4. **01-api-log-usage.md** - 使用量データ記録API ✅
5. **13-data-validation.md** - データ検証・エラーハンドリング ✅

## Phase 2: 自動化・バックエンドロジック
6. **10-conservation-score-logic.md** - 節約スコア計算ロジック
7. **03-api-daily-aggregation.md** - 日次集計Cron API
8. **11-vercel-cron-setup.md** - Vercel Cron Job設定

## Phase 3: ユーザー向け機能
9. **12-authentication-system.md** - 認証システム強化
10. **02-api-hatch-egg.md** - たまご開封API
11. **06-hatch-egg-ui.md** - たまご開封UI
12. **08-fish-management-ui.md** - 魚の育成状況表示
13. **07-environment-system.md** - 環境レベル表示システム

## Phase 4: 共有機能・最適化
14. **17-link-aquarium-fish-selection.md** - Link水槽魚選択システム
15. **05-unity-integration.md** - React↔Unity連携強化
16. **14-performance-optimization.md** - パフォーマンス最適化

## Phase 5: 品質保証
17. **15-testing-strategy.md** - テスト戦略・実装

## 実行理由
**Phase 1を最優先とする理由:**
- ESPデバイスからのデータ収集が全システムの基盤
- ハードウェア開発との並行作業を可能にする
- データ蓄積期間を確保してゲームロジックの検証材料を提供

**依存関係:**
- 01, 16 → 04, 09 に依存
- 03, 10 → 01 に依存  
- 02, 06-08 → 03, 10 に依存
- 17 → 02, 08 に依存

## 最新実装状況 (2025/01/15)

### Phase 1 完了内容
**16. デバイス登録システム** が完了し、以下の機能が実装されました：

#### バックエンド
- ESP32デバイス登録API (`/api/register-device`)
- デバイス・ユーザー紐付けAPI (`/api/link-device`)
- デバイス情報取得API (`/api/user-devices`, `/api/device-details`)
- デバイス登録解除API (`/api/unlink-device`)
- 完全なFirestore統合とセキュリティ実装

#### フロントエンド
- メイン画面「デバイス管理」タブ追加
- デバイス登録画面（8桁PINコード入力）
- 登録済みデバイス管理画面
- リアルタイム状態監視（オンライン/オフライン）
- デバイス解除機能

#### セキュリティ
- Firebase ID Token認証
- デバイス所有者検証
- 安全な登録・解除フロー

これによりESP32デバイスからのデータ収集基盤が完全に整い、**Phase 2の自動化・バックエンドロジック実装**に進む準備が整いました。

詳細実装内容: [18-device-integration-implementation.md](./18-device-integration-implementation.md)