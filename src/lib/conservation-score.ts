/**
 * 節約スコア計算ロジック
 * ユーザーの水・電気使用量から節約スコアを算出
 */

// 基準値設定（寮生活平均値）
export const BASELINE_CONFIG = {
  WATER: 100,        // リットル/日
  ELECTRICITY: 0.5,  // 時間/日（無駄な照明使用時間：30分）
} as const;;;

export interface UsageData {
  waterUsage?: number;      // リットル/日
  electricityUsage?: number; // 秒/日（無駄な使用時間、内部で時間に変換される）
  // デバイス情報（条件に応じた基準値適用のため）
  electricityDeviceLastSeen?: Date; // 電気デバイスの最終接続日時
  calculationDate?: Date;   // 計算対象日（デフォルトは今日）
}

export interface ConservationResult {
  conservationScore: number;
  waterReduction: number;
  electricityReduction: number;
  details: {
    waterUsage: number;
    electricityUsage: number;
    waterSaved: number;
    electricitySaved: number;
  };
}

/**
 * 節約スコアを計算する
 * @param usage 使用量データ
 * @returns 計算結果
 */
export function calculateConservationScore(usage: UsageData): ConservationResult {
  const waterUsage = usage.waterUsage || 0;
  const electricityUsageSeconds = usage.electricityUsage || 0; // 秒/日（無駄な使用時間）
  
  // 電気使用量を秒から時間に変換
  const electricityUsage = electricityUsageSeconds / 3600; // 時間/日に変換

  // 計算対象日（デフォルトは今日）
  const calculationDate = usage.calculationDate || new Date();
  const calculationDateString = calculationDate.toISOString().split('T')[0];

  // 条件に応じた実際の使用量を決定
  let actualWaterUsage = waterUsage;
  let actualElectricityUsage = electricityUsage;

  // 水使用量が0の時は必ず基準値として計算
  if (waterUsage === 0) {
    actualWaterUsage = BASELINE_CONFIG.WATER;
  }

  // 電気使用量が0かつデバイスのlastSeenがその日でない場合は基準値として計算
  if (electricityUsageSeconds === 0 && usage.electricityDeviceLastSeen) {
    const deviceLastSeenString = usage.electricityDeviceLastSeen.toISOString().split('T')[0];
    if (deviceLastSeenString !== calculationDateString) {
      actualElectricityUsage = BASELINE_CONFIG.ELECTRICITY;
    }
  }

  // 削減率計算（負の値も許可）
  const waterReduction = (BASELINE_CONFIG.WATER - actualWaterUsage) / BASELINE_CONFIG.WATER;
  const electricityReduction = (BASELINE_CONFIG.ELECTRICITY - actualElectricityUsage) / BASELINE_CONFIG.ELECTRICITY;

  // スコア計算（負の値も許可）
  const conservationScore = Math.round((waterReduction + electricityReduction) * 50);

  // 詳細データ計算（負の値も許可）
  const waterSaved = BASELINE_CONFIG.WATER - actualWaterUsage;
  const electricitySaved = BASELINE_CONFIG.ELECTRICITY - actualElectricityUsage; // 削減した無駄時間（時間）

  return {
    conservationScore: Math.max(-100, Math.min(100, conservationScore)), // -100から100の範囲に制限
    waterReduction,
    electricityReduction,
    details: {
      waterUsage: actualWaterUsage,
      electricityUsage: actualElectricityUsage,
      waterSaved,
      electricitySaved,
    },
  };
}

/**
 * 複数日のスコア履歴から平均スコアを計算
 * @param scores スコア配列
 * @returns 平均スコア
 */
export function calculateAverageScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((acc, score) => acc + score, 0);
  return Math.round(sum / scores.length);
}

/**
 * スコアレベルを判定
 * @param score 節約スコア
 * @returns レベル文字列
 */
export function getScoreLevel(score: number): string {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'average';
  if (score >= 20) return 'poor';
  if (score >= 0) return 'very_poor';
  return 'wasteful'; // 負のスコア用
}

/**
 * スコアに基づくメッセージを取得
 * @param score 節約スコア
 * @returns メッセージ
 */
export function getScoreMessage(score: number): string {
  const level = getScoreLevel(score);
  
  const messages: Record<string, string> = {
    excellent: '素晴らしい節約です！魚たちが喜んでいます🐟',
    good: '良い節約ができています！この調子で続けましょう',
    average: '平均的な節約です。もう少し頑張ってみましょう',
    poor: '節約を意識してみましょう。小さな改善から始められます',
    very_poor: '節約に取り組んで、魚たちの環境を改善しましょう',
    wasteful: '使いすぎです！魚たちが困っています。すぐに改善が必要です⚠️',
  };

  return messages[level];
}