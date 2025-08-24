/**
 * 節約スコア計算ロジック
 * ユーザーの水・電気使用量から節約スコアを算出
 */

// 基準値設定（寮生活平均値）
export const BASELINE_CONFIG = {
  WATER: 100,        // リットル/日
  ELECTRICITY: 5,    // kWh/日
} as const;

export interface UsageData {
  waterUsage?: number;
  electricityUsage?: number;
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
  const electricityUsage = usage.electricityUsage || 0;

  // 削減率計算（0-1の範囲）
  const waterReduction = Math.max(0, (BASELINE_CONFIG.WATER - waterUsage) / BASELINE_CONFIG.WATER);
  const electricityReduction = Math.max(0, (BASELINE_CONFIG.ELECTRICITY - electricityUsage) / BASELINE_CONFIG.ELECTRICITY);

  // スコア計算（0-100点）
  const conservationScore = Math.round((waterReduction + electricityReduction) * 50);

  // 詳細データ計算
  const waterSaved = Math.max(0, BASELINE_CONFIG.WATER - waterUsage);
  const electricitySaved = Math.max(0, BASELINE_CONFIG.ELECTRICITY - electricityUsage);

  return {
    conservationScore: Math.max(0, Math.min(100, conservationScore)), // 0-100の範囲に制限
    waterReduction,
    electricityReduction,
    details: {
      waterUsage,
      electricityUsage,
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
  return 'very_poor';
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
  };

  return messages[level];
}