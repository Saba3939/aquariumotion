import { useCallback, useState } from "react";
import { User } from "firebase/auth";
import type { Fish } from "@/types/aquarium";
import { useAquariumApi } from "./useAquariumApi";
import {
  showDailyUsageProcessToast,
  showForceProcessDailyUsageToast,
  showFishMoveSuccessToast,
  showFishStatusResetToast,
  showFishStatusLogToast,
  showErrorToast,
  showInfoToast,
} from "@/lib/toast-utils";

interface UseAquariumHandlersProps {
  user: User | null;
  fishData: Fish[] | null;
  fetchAquariumData: () => Promise<void>;
}

export const useAquariumHandlers = ({
  user,
  fishData,
  fetchAquariumData,
}: UseAquariumHandlersProps) => {
  const [showBirthDialog, setShowBirthDialog] = useState(false);
  const [newBornFish, setNewBornFish] = useState<Fish | null>(null);
  const [showFishSelectionDialog, setShowFishSelectionDialog] = useState(false);
  const [showLinkAquariumSelectionDialog, setShowLinkAquariumSelectionDialog] = useState(false);

  const {
    hatchEgg,
    releaseFish,
    discardEgg,
    processDailyUsage,
    forceProcessDailyUsage,
    updateFishStatus,
    resetFishStatus,
  } = useAquariumApi(user);

  // 卵の孵化処理
  const handleHatchEgg = useCallback(async () => {
    const result = await hatchEgg();
    if (!result) return;

    // 魚数上限に達している場合
    if (result.error === 'FISH_LIMIT_EXCEEDED') {
      setShowFishSelectionDialog(true);
      return;
    }

    // 新しい魚の情報を表示
    if (result.success && result.data?.newFish) {
      setNewBornFish(result.data.newFish);
      setShowBirthDialog(true);
    }

    // 水族館データを再取得して表示を更新
    await fetchAquariumData();
  }, [hatchEgg, fetchAquariumData]);

  // 魚を手放す処理
  const handleReleaseFish = useCallback(async (fishId: string) => {
    const result = await releaseFish(fishId);
    if (!result) return;

    if (result.success) {
      console.log(`${result.data.releasedFish.fish_name}を手放しました`);
      // 取捨選択ダイアログを閉じる
      setShowFishSelectionDialog(false);

      // 卵の孵化を再実行（新しい魚の情報を取得）
      const hatchResult = await hatchEgg();
      if (hatchResult?.success && hatchResult.data?.newFish) {
        setNewBornFish(hatchResult.data.newFish);
        setShowBirthDialog(true);
      }

      // 最後に水族館データを再取得して表示を更新
      await fetchAquariumData();
    }
  }, [releaseFish, hatchEgg, fetchAquariumData]);

  // 卵を破棄する処理
  const handleDiscardEgg = useCallback(async (eggCount = 1) => {
    const result = await discardEgg(eggCount);
    if (!result) return;

    if (result.success) {
      console.log(`${result.data.discardedEggCount}個の卵を放棄しました`);
      // 取捨選択ダイアログを閉じる
      setShowFishSelectionDialog(false);

      // 卵の孵化を再実行（新しい魚の情報を取得）
      const hatchResult = await hatchEgg();
      if (hatchResult?.success && hatchResult.data?.newFish) {
        setNewBornFish(hatchResult.data.newFish);
        setShowBirthDialog(true);
      }

      // 最後に水族館データを再取得して表示を更新
      await fetchAquariumData();
    }
  }, [discardEgg, hatchEgg, fetchAquariumData]);

  // 日次データ処理
  const handleProcessDailyUsage = useCallback(async () => {
    const responseData = await processDailyUsage();
    if (!responseData) return;

    if (responseData.success) {
      const data = responseData.data;

      // 初回ログインで処理されたデータがある場合のみメッセージを表示
      if (data.isFirstLoginToday && data.processedCount > 0) {
        showDailyUsageProcessToast(data);
        // 水族館データを再取得して表示を更新
        await fetchAquariumData();
      } else if (data.isFirstLoginToday && data.processedCount === 0) {
        showDailyUsageProcessToast(data);
      }
    }
  }, [processDailyUsage, fetchAquariumData]);

  // 強制日次データ処理
  const handleForceProcessDailyUsage = useCallback(async () => {
    const responseData = await forceProcessDailyUsage();
    if (!responseData) return;

    if (responseData.success) {
      const data = responseData.data;
      showForceProcessDailyUsageToast(data);
      // 水族館データを再取得して表示を更新
      await fetchAquariumData();
    } else {
      showErrorToast('🔧 デバッグ処理エラー', responseData.error || '不明なエラー');
    }
  }, [forceProcessDailyUsage, fetchAquariumData]);

  // raising状態の魚選択ダイアログを表示
  const handleSendFishToLinkAquarium = useCallback(() => {
    if (!fishData || fishData.length === 0) return;

    // raising状態の魚を検索
    const raisingFish = fishData.filter(fish => fish.status === 'raising');

    if (raisingFish.length === 0) {
      showInfoToast('🐟 Link水槽に送る魚がありません', 'raising状態の魚が見つかりませんでした');
      return;
    }

    // 魚選択ダイアログを表示
    setShowLinkAquariumSelectionDialog(true);
  }, [fishData]);

  // 選択された魚をLink水槽に送る
  const handleSendSelectedFishToLinkAquarium = useCallback(async (fishId: string) => {
    const selectedFish = fishData?.find(fish => fish.id === fishId);
    if (!selectedFish) return;

    try {
      const result = await updateFishStatus(fishId, 'inLinkAquarium');

      if (result && result.success) {
        const { resetToRaisingFish } = result.data;
        const resetFishNames = resetToRaisingFish?.map((fish: { fish_name: string }) => fish.fish_name);

        showFishMoveSuccessToast(selectedFish.fish_name, resetFishNames);

        // 水族館データを再取得して表示を更新
        await fetchAquariumData();
      }
    } catch (error) {
      console.error('魚のステータス更新エラー:', error);
      showErrorToast('🔴 魚の移動に失敗しました', error as Error);
    }
  }, [fishData, updateFishStatus, fetchAquariumData]);

  // 魚のステータスをログ出力
  const handleLogFishStatus = useCallback(() => {
    if (!fishData || fishData.length === 0) {
      console.log('🐟 魚データがありません');
      showInfoToast('🐟 魚データがありません', '現在水槽に魚がいません', 2000);
      return;
    }

    console.log('=== 🐟 魚ステータス詳細ログ ===');
    console.table(fishData.map(fish => ({
      名前: fish.fish_name,
      ステータス: fish.status,
      成長レベル: fish.growthLevel,
      卵メーター: fish.eggMeter,
      ID: fish.id,
      誕生日: fish.birthDate?.toDate?.()?.toLocaleDateString() || '不明'
    })));

    const statusCounts = fishData.reduce((acc, fish) => {
      acc[fish.status] = (acc[fish.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('ステータス別集計:', statusCounts);
    showFishStatusLogToast(fishData.length);
  }, [fishData]);

  // 魚のステータスをリセット
  const handleResetFishStatus = useCallback(async () => {
    if (!fishData || fishData.length === 0) {
      showInfoToast('🐟 リセットする魚がありません', '現在水槽に魚がいません', 2000);
      return;
    }

    try {
      const result = await resetFishStatus();

      if (result && result.success) {
        const { updatedFishCount } = result.data;
        showFishStatusResetToast(updatedFishCount);

        // 水族館データを再取得して表示を更新
        await fetchAquariumData();
      }
    } catch (error) {
      console.error('魚ステータスリセットエラー:', error);
      showErrorToast('🔴 魚ステータスのリセットに失敗しました', error as Error);
    }
  }, [fishData, resetFishStatus, fetchAquariumData]);

  return {
    // 状態
    showBirthDialog,
    setShowBirthDialog,
    newBornFish,
    setNewBornFish,
    showFishSelectionDialog,
    setShowFishSelectionDialog,
    showLinkAquariumSelectionDialog,
    setShowLinkAquariumSelectionDialog,
    // ハンドラー
    handleHatchEgg,
    handleReleaseFish,
    handleDiscardEgg,
    handleProcessDailyUsage,
    handleForceProcessDailyUsage,
    handleSendFishToLinkAquarium,
    handleSendSelectedFishToLinkAquarium,
    handleLogFishStatus,
    handleResetFishStatus,
  };
};