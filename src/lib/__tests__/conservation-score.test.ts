import { 
  calculateConservationScore, 
  getScoreLevel, 
  getScoreMessage,
  calculateAverageScore,
  BASELINE_CONFIG 
} from '../conservation-score';

describe('Conservation Score Tests', () => {
  describe('calculateConservationScore', () => {
    test('完全な節約（使用量0）の場合は86点', () => {
      const result = calculateConservationScore({
        waterUsage: 0,
        electricityUsage: 0
      });

      expect(result.conservationScore).toBe(86); // totalReduction = 0.5 → 86点
      expect(result.waterReduction).toBe(0); // 基準値なので削減なし
      expect(result.electricityReduction).toBe(1); // 0秒なので100%削減
      expect(result.details.waterSaved).toBe(0); // 基準値なので節約なし
      expect(result.details.electricitySaved).toBe(BASELINE_CONFIG.ELECTRICITY); // 電気は完全節約
    });

    test('基準値と同等使用の場合は0点', () => {
      const result = calculateConservationScore({
        waterUsage: BASELINE_CONFIG.WATER, // 基準値100L
        electricityUsage: BASELINE_CONFIG.ELECTRICITY * 3600 // 基準値0.5時間 = 1800秒
      });

      expect(Math.abs(result.conservationScore)).toBe(0); // totalReduction = 0 → 0点 (-0を考慮)
      expect(result.waterReduction).toBe(0);
      expect(result.electricityReduction).toBe(0);
      expect(result.details.waterSaved).toBe(0);
      expect(result.details.electricitySaved).toBe(0);
    });

    test('基準値の50%使用の場合は86点', () => {
      const result = calculateConservationScore({
        waterUsage: BASELINE_CONFIG.WATER * 0.5,  // 50L
        electricityUsage: BASELINE_CONFIG.ELECTRICITY * 3600 * 0.5 // 0.25時間 = 900秒
      });

      expect(result.conservationScore).toBe(86); // totalReduction = 0.5 → 86点
      expect(result.waterReduction).toBe(0.5);
      expect(result.electricityReduction).toBe(0.5);
    });

    test('基準値を超過した場合は負のスコア', () => {
      const result = calculateConservationScore({
        waterUsage: BASELINE_CONFIG.WATER * 2, // 200L（100%超過）
        electricityUsage: BASELINE_CONFIG.ELECTRICITY * 3600 * 2 // 1時間（100%超過）
      });

      expect(result.conservationScore).toBe(-86); // totalReduction = -1 → -86点
      expect(result.waterReduction).toBe(-1);
      expect(result.electricityReduction).toBe(-1);
      expect(result.details.waterSaved).toBe(-BASELINE_CONFIG.WATER);
      expect(result.details.electricitySaved).toBe(-BASELINE_CONFIG.ELECTRICITY);
    });

    test('片方だけ節約した場合の適切なスコア', () => {
      // 水のみ50%節約、電気は基準値通り
      const result = calculateConservationScore({
        waterUsage: BASELINE_CONFIG.WATER * 0.5, // 50L（50%節約）
        electricityUsage: BASELINE_CONFIG.ELECTRICITY * 3600 // 基準値（節約なし）
      });

      expect(result.conservationScore).toBe(63); // totalReduction = 0.25 → 63点
      expect(result.waterReduction).toBe(0.5);
      expect(result.electricityReduction).toBe(0);
    });

    test('未定義値の処理', () => {
      const result = calculateConservationScore({});

      expect(result.conservationScore).toBe(86); // totalReduction = 0.5 → 86点
      expect(result.details.waterUsage).toBe(BASELINE_CONFIG.WATER); // 水0の場合は基準値適用
      expect(result.details.electricityUsage).toBe(0); // 電気は0のまま（デバイス情報なし）
    });
  });

  describe('条件に応じた基準値適用ロジック', () => {
    const testDate = new Date('2024-01-15');
    const yesterdayDate = new Date('2024-01-14');
    const sameDayDate = new Date('2024-01-15');

    test('水使用量が0の場合は常に基準値として計算', () => {
      const result = calculateConservationScore({
        waterUsage: 0,
        electricityUsage: 900, // 15分 = 900秒
        calculationDate: testDate
      });

      expect(result.details.waterUsage).toBe(BASELINE_CONFIG.WATER); // 基準値100L
      expect(result.details.electricityUsage).toBe(0.25); // 0.25時間
      expect(result.conservationScore).toBe(63); // totalReduction = 0.25 → 63点
    });

    test('電気使用量が0かつデバイスlastSeenが当日でない場合は基準値として計算', () => {
      const result = calculateConservationScore({
        waterUsage: 50,
        electricityUsage: 0,
        electricityDeviceLastSeen: yesterdayDate,
        calculationDate: testDate
      });

      expect(result.details.waterUsage).toBe(50); // そのまま50L
      expect(result.details.electricityUsage).toBe(BASELINE_CONFIG.ELECTRICITY); // 基準値0.5時間
      expect(result.conservationScore).toBe(63); // totalReduction = 0.25 → 63点
    });

    test('電気使用量が0でもデバイスlastSeenが当日の場合は0のまま計算', () => {
      const result = calculateConservationScore({
        waterUsage: 50,
        electricityUsage: 0,
        electricityDeviceLastSeen: sameDayDate,
        calculationDate: testDate
      });

      expect(result.details.waterUsage).toBe(50); // そのまま50L
      expect(result.details.electricityUsage).toBe(0); // 0のまま
      expect(result.conservationScore).toBe(95); // totalReduction = 0.75 → 95点
    });

    test('電気使用量が0でもデバイス情報がない場合は0のまま計算', () => {
      const result = calculateConservationScore({
        waterUsage: 50,
        electricityUsage: 0,
        calculationDate: testDate
      });

      expect(result.details.waterUsage).toBe(50); // そのまま50L
      expect(result.details.electricityUsage).toBe(0); // 0のまま（デバイス情報なし）
      expect(result.conservationScore).toBe(95); // totalReduction = 0.75 → 95点
    });

    test('両方の条件が適用される場合', () => {
      const result = calculateConservationScore({
        waterUsage: 0,
        electricityUsage: 0,
        electricityDeviceLastSeen: yesterdayDate,
        calculationDate: testDate
      });

      expect(result.details.waterUsage).toBe(BASELINE_CONFIG.WATER); // 基準値100L
      expect(result.details.electricityUsage).toBe(BASELINE_CONFIG.ELECTRICITY); // 基準値0.5時間
      expect(Math.abs(result.conservationScore)).toBe(0); // totalReduction = 0 → 0点 (-0を考慮)
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
      // 節約を頑張った日
      const goodDay = calculateConservationScore({
        waterUsage: 70,  // 水 70L（30%節約）
        electricityUsage: 900  // 無駄な照明使用時間 15分 = 900秒（50%節約）
      });

      expect(goodDay.conservationScore).toBe(80); // totalReduction = 0.4 → 80点
      expect(getScoreLevel(goodDay.conservationScore)).toBe('excellent');

      // 普通の日
      const averageDay = calculateConservationScore({
        waterUsage: 90,  // 水 90L（10%節約）
        electricityUsage: 1800  // 無駄な照明使用時間 30分（基準値） = 1800秒
      });

      expect(averageDay.conservationScore).toBe(18); // totalReduction = 0.05 → 18点
      expect(getScoreLevel(averageDay.conservationScore)).toBe('very_poor');
    });
  });
});