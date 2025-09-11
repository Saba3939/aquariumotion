import { 
  calculateConservationScore, 
  getScoreLevel, 
  getScoreMessage,
  calculateAverageScore,
  BASELINE_CONFIG 
} from '../conservation-score';

describe('Conservation Score Tests', () => {
  describe('calculateConservationScore', () => {
    test('完全な節約（使用量0）の場合は100点', () => {
      const result = calculateConservationScore({
        waterUsage: 0,
        electricityUsage: 0
      });
      
      expect(result.conservationScore).toBe(100);
      expect(result.waterReduction).toBe(1);
      expect(result.electricityReduction).toBe(1);
      expect(result.details.waterSaved).toBe(BASELINE_CONFIG.WATER);
      expect(result.details.electricitySaved).toBe(BASELINE_CONFIG.ELECTRICITY);
    });

    test('基準値と同等使用の場合は0点', () => {
      const result = calculateConservationScore({
        waterUsage: BASELINE_CONFIG.WATER, // 基準値
        electricityUsage: BASELINE_CONFIG.ELECTRICITY // 基準値
      });
      
      expect(result.conservationScore).toBe(0);
      expect(result.waterReduction).toBe(0);
      expect(result.electricityReduction).toBe(0);
      expect(result.details.waterSaved).toBe(0);
      expect(result.details.electricitySaved).toBe(0);
    });

    test('基準値の50%使用の場合は50点', () => {
      const result = calculateConservationScore({
        waterUsage: BASELINE_CONFIG.WATER * 0.5,  // 50% 使用
        electricityUsage: BASELINE_CONFIG.ELECTRICITY * 0.5 // 50% 使用
      });
      
      expect(result.conservationScore).toBe(50);
      expect(result.waterReduction).toBe(0.5);
      expect(result.electricityReduction).toBe(0.5);
    });

    test('基準値を超過した場合は負のスコア', () => {
      const result = calculateConservationScore({
        waterUsage: BASELINE_CONFIG.WATER * 2, // 基準値の2倍
        electricityUsage: BASELINE_CONFIG.ELECTRICITY * 2 // 基準値の2倍
      });
      
      expect(result.conservationScore).toBe(-100); // ((-1) + (-1)) * 50 = -100
      expect(result.waterReduction).toBe(-1);
      expect(result.electricityReduction).toBe(-1);
      expect(result.details.waterSaved).toBe(-BASELINE_CONFIG.WATER);
      expect(result.details.electricitySaved).toBe(-BASELINE_CONFIG.ELECTRICITY);
    });

    test('片方だけ節約した場合の適切なスコア', () => {
      // 水のみ50%節約、電気は基準値通り
      const result = calculateConservationScore({
        waterUsage: BASELINE_CONFIG.WATER * 0.5,
        electricityUsage: BASELINE_CONFIG.ELECTRICITY
      });
      
      expect(result.conservationScore).toBe(25); // (0.5 + 0) * 50 = 25
      expect(result.waterReduction).toBe(0.5);
      expect(result.electricityReduction).toBe(0);
    });

    test('未定義値の処理', () => {
      const result = calculateConservationScore({});
      
      expect(result.conservationScore).toBe(100);
      expect(result.details.waterUsage).toBe(0);
      expect(result.details.electricityUsage).toBe(0);
    });
  });

  describe('getScoreLevel', () => {
    test('スコア範囲による適切なレベル判定', () => {
      expect(getScoreLevel(90)).toBe('excellent');
      expect(getScoreLevel(80)).toBe('excellent');
      expect(getScoreLevel(70)).toBe('good');
      expect(getScoreLevel(60)).toBe('good');
      expect(getScoreLevel(50)).toBe('average');
      expect(getScoreLevel(40)).toBe('average');
      expect(getScoreLevel(30)).toBe('poor');
      expect(getScoreLevel(20)).toBe('poor');
      expect(getScoreLevel(10)).toBe('very_poor');
      expect(getScoreLevel(0)).toBe('very_poor');
    });

    test('境界値のテスト', () => {
      expect(getScoreLevel(80)).toBe('excellent'); // 80以上
      expect(getScoreLevel(79)).toBe('good');
      expect(getScoreLevel(60)).toBe('good');      // 60以上
      expect(getScoreLevel(59)).toBe('average');
      expect(getScoreLevel(40)).toBe('average');   // 40以上
      expect(getScoreLevel(39)).toBe('poor');
      expect(getScoreLevel(20)).toBe('poor');      // 20以上
      expect(getScoreLevel(19)).toBe('very_poor');
    });

    test('100点を超過した場合の処理', () => {
      expect(getScoreLevel(150)).toBe('excellent');
    });

    test('負の値の処理', () => {
      expect(getScoreLevel(-10)).toBe('wasteful');
    });
  });

  describe('getScoreMessage', () => {
    test('各レベルに対応するメッセージ', () => {
      expect(getScoreMessage(90)).toContain('素晴らしい'); // excellent
      expect(getScoreMessage(70)).toContain('良い'); // good
      expect(getScoreMessage(50)).toContain('平均的'); // average
      expect(getScoreMessage(30)).toContain('節約を意識'); // poor
      expect(getScoreMessage(10)).toContain('魚たちの環境'); // very_poor
      expect(getScoreMessage(-20)).toContain('使いすぎです'); // wasteful
    });
  });

  describe('calculateAverageScore', () => {
    test('複数スコアの平均計算', () => {
      const scores = [80, 60, 40, 100];
      const average = calculateAverageScore(scores);
      
      expect(average).toBe(70);
    });

    test('単一スコアの場合', () => {
      const scores = [75];
      const average = calculateAverageScore(scores);
      
      expect(average).toBe(75);
    });

    test('空配列の場合', () => {
      const scores: number[] = [];
      const average = calculateAverageScore(scores);
      
      expect(average).toBe(0);
    });

    test('小数点を含む平均値の丸め', () => {
      const scores = [33, 34, 33];
      const average = calculateAverageScore(scores);
      
      expect(average).toBe(33); // 33.333... → 33
    });
  });

  describe('統合テスト', () => {
    test('現実的な使用量パターン', () => {
      // 節水を頑張った日
      const goodDay = calculateConservationScore({
        waterUsage: 70,
        electricityUsage: 4
      });

      expect(goodDay.conservationScore).toBe(25); // (0.3 + 0.2) * 50 = 25
      expect(getScoreLevel(goodDay.conservationScore)).toBe('poor');

      // 普通の日
      const averageDay = calculateConservationScore({
        waterUsage: 90,
        electricityUsage: 4.5
      });

      expect(averageDay.conservationScore).toBe(10); // (0.1 + 0.1) * 50 = 10
      expect(getScoreLevel(averageDay.conservationScore)).toBe('very_poor');
    });
  });
});