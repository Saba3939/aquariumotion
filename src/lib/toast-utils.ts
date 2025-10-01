import { toast } from "sonner";

// Daily usage処理結果のtoast表示
export interface ProcessDailyUsageData {
  processedDates: string[];
  totalScoreAdded: number;
  processedCount?: number;
  isFirstLoginToday?: boolean;
}

export const showDailyUsageProcessToast = (data: ProcessDailyUsageData) => {
  let message = '';
  let description = '';

  // 初回ログインで処理対象なしの場合
  if (data.isFirstLoginToday && data.processedCount === 0) {
    message = '🌟 今日初回ログインです！';
    description = '処理対象の使用量データがありませんでした';
    toast.info(message, { description, duration: 3000 });
    return;
  }

  // 通常処理の場合：スコアに応じてメッセージを変更
  const scoreValue = data.totalScoreAdded;
  
  // メッセージのベース
  const baseMessage = `${data.processedDates.length}日分のデータを一括処理しました！`;
  
  // スコア範囲に応じてメッセージとアイコンを変更
  if (scoreValue >= 100) {
    message = `🏆 ${baseMessage}`;
    description = `素晴らしい！総合節約スコア: +${scoreValue}点 - 地球環境に大きく貢献しています！`;
  } else if (scoreValue >= 50) {
    message = `⭐ ${baseMessage}`;
    description = `とても良いですね！総合節約スコア: +${scoreValue}点 - 環境保護の意識が高いです`;
  } else if (scoreValue >= 20) {
    message = `🌟 ${baseMessage}`;
    description = `順調です！総合節約スコア: +${scoreValue}点 - この調子で続けましょう`;
  } else if (scoreValue > 0) {
    message = `✨ ${baseMessage}`;
    description = `良いスタートです！総合節約スコア: +${scoreValue}点`;
  } else if (scoreValue === 0) {
    message = `📊 ${baseMessage}`;
    description = `総合節約スコア: ${scoreValue}点 - 現状維持です`;
  } else if (scoreValue >= -20) {
    message = `💡 ${baseMessage}`;
    description = `総合節約スコア: ${scoreValue}点 - 少し気をつけてみましょう`;
  } else if (scoreValue >= -50) {
    message = `⚠️ ${baseMessage}`;
    description = `総合節約スコア: ${scoreValue}点 - 環境への配慮を意識してください`;
  } else {
    message = `🌍 ${baseMessage}`;
    description = `総合節約スコア: ${scoreValue}点 - 地球のために改善を検討しましょう`;
  }

  // toast種類の決定
  if (scoreValue > 0) {
    toast.success(message, { description, duration: 5000 });
  } else if (scoreValue < 0) {
    toast.error(message, { description, duration: 5000 });
  } else {
    toast.info(message, { description, duration: 4000 });
  }
};

// 強制Daily usage処理結果のtoast表示
export const showForceProcessDailyUsageToast = (data: ProcessDailyUsageData) => {
  let toastMessage = '';
  let toastDescription = '';
  
  const scoreValue = data.totalScoreAdded;
  
  // 処理対象データがない場合
  if (!data.processedCount || data.processedCount === 0) {
    toastMessage = '🔧 dailyUsage処理を強制実行';
    toastDescription = '処理対象データなし';
    toast.info(toastMessage, { description: toastDescription, duration: 4000 });
    return;
  }

  // スコア値に応じてメッセージとアイコンを変更
  const baseMessage = 'dailyUsage処理を強制実行';
  const processInfo = `${data.processedCount}件処理`;
  
  if (scoreValue >= 100) {
    toastMessage = `🏆 ${baseMessage}`;
    toastDescription = `${processInfo} | 素晴らしい成果！スコア変化: +${scoreValue}点`;
  } else if (scoreValue >= 50) {
    toastMessage = `⭐ ${baseMessage}`;
    toastDescription = `${processInfo} | とても良い結果！スコア変化: +${scoreValue}点`;
  } else if (scoreValue >= 20) {
    toastMessage = `🌟 ${baseMessage}`;
    toastDescription = `${processInfo} | 順調な成果！スコア変化: +${scoreValue}点`;
  } else if (scoreValue > 0) {
    toastMessage = `✨ ${baseMessage}`;
    toastDescription = `${processInfo} | スコア変化: +${scoreValue}点`;
  } else if (scoreValue === 0) {
    toastMessage = `🔧 ${baseMessage}`;
    toastDescription = `${processInfo} | スコア変化: ${scoreValue}点`;
  } else if (scoreValue >= -20) {
    toastMessage = `💡 ${baseMessage}`;
    toastDescription = `${processInfo} | スコア変化: ${scoreValue}点 - 改善の余地があります`;
  } else if (scoreValue >= -50) {
    toastMessage = `⚠️ ${baseMessage}`;
    toastDescription = `${processInfo} | スコア変化: ${scoreValue}点 - 注意が必要です`;
  } else {
    toastMessage = `🌍 ${baseMessage}`;
    toastDescription = `${processInfo} | スコア変化: ${scoreValue}点 - 大幅改善が必要です`;
  }

  // toast種類の決定
  if (scoreValue > 0) {
    toast.success(toastMessage, { description: toastDescription, duration: 5000 });
  } else if (scoreValue < 0) {
    toast.error(toastMessage, { description: toastDescription, duration: 5000 });
  } else {
    toast.info(toastMessage, { description: toastDescription, duration: 4000 });
  }
};

// 初回ログイン時のウェルカムtoast
export const showWelcomeToast = (fishName?: string) => {
  toast.success('🎉 AQUARIUMOTIONへようこそ！', {
    description: fishName
      ? `「${fishName}」があなたの水族館で泳ぎ始めました。環境保護活動で水族館を発展させていきましょう！`
      : '環境保護活動で水族館を発展させていきましょう！',
    duration: 6000,
  });
};

// 魚の移動成功toast
export const showFishMoveSuccessToast = (fishName: string, resetFishNames?: string[]) => {
  let description = `${fishName}がLink水槽で泳いでいます`;

  if (resetFishNames && resetFishNames.length > 0) {
    description += `\n${resetFishNames.join(', ')}は水槽に戻りました`;
  }

  toast.success('🏊‍♀️ 魚をLink水槽に送りました！', {
    description,
    duration: 5000,
  });
};

// 魚ステータスリセット成功toast
export const showFishStatusResetToast = (updatedFishCount: number) => {
  toast.success('🔄 魚ステータスをリセットしました！', {
    description: `${updatedFishCount}匹の魚をraisingに戻しました`,
    duration: 4000,
  });
};

// 魚ステータスログ出力toast
export const showFishStatusLogToast = (fishCount: number) => {
  toast.info('🐟 魚ステータスをログ出力しました', {
    description: `総数: ${fishCount}匹 | 詳細はコンソールを確認`,
    duration: 3000,
  });
};

// 汎用エラーtoast
export const showErrorToast = (title: string, error: string | Error) => {
  toast.error(title, {
    description: error instanceof Error ? error.message : error,
    duration: 4000,
  });
};

// 汎用情報toast
export const showInfoToast = (title: string, description: string, duration = 3000) => {
  toast.info(title, {
    description,
    duration,
  });
};