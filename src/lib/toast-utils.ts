import { toast } from "sonner";

// Daily usage処理結果のtoast表示
export interface ProcessDailyUsageData {
  processedDates: string[];
  totalScoreAdded: number;
  processedCount?: number;
  isFirstLoginToday?: boolean;
}

export const showDailyUsageProcessToast = (data: ProcessDailyUsageData) => {
  const message = data.isFirstLoginToday && data.processedCount === 0
    ? '🌟 今日初回ログインです！'
    : `🌟 ${data.processedDates.length}日分のデータを一括処理しました！`;

  const description = data.isFirstLoginToday && data.processedCount === 0
    ? '処理対象の使用量データがありませんでした'
    : `総合節約スコア: ${data.totalScoreAdded >= 0 ? '+' : ''}${data.totalScoreAdded}点`;

  if (data.totalScoreAdded > 0) {
    toast.success(message, { description, duration: 5000 });
  } else if (data.totalScoreAdded < 0) {
    toast.error(message, { description, duration: 5000 });
  } else {
    toast.info(message, { description, duration: data.isFirstLoginToday ? 3000 : 4000 });
  }
};

// 強制Daily usage処理結果のtoast表示
export const showForceProcessDailyUsageToast = (data: ProcessDailyUsageData) => {
  const toastMessage = `🔧 dailyUsage処理を強制実行`;
  const toastDescription = data.processedCount && data.processedCount > 0
    ? `${data.processedCount}件処理 | スコア変化: ${data.totalScoreAdded >= 0 ? '+' : ''}${data.totalScoreAdded}点`
    : '処理対象データなし';

  if (data.totalScoreAdded > 0) {
    toast.success(toastMessage, { description: toastDescription, duration: 5000 });
  } else if (data.totalScoreAdded < 0) {
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