"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { User, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Image from "next/image";
import UnityComponent from "@/components/unitycomponent";
import DeviceManager from "@/components/device-manager";
import { useRouter } from "next/navigation";

// カスタムフック
import { useAuth } from "@/hooks/useAuth";
import { useAquariumData } from "@/hooks/useAquariumData";
import { useAquariumApi } from "@/hooks/useAquariumApi";

// コンポーネント
import LoginScreen from "@/components/login-screen";
import AquariumLevel from "@/components/aquarium-level";
import EggHatchingStatus from "@/components/egg-hatching-status";
import FishStatus from "@/components/fish-status";
import DebugTools from "@/components/debug-tools";
import Dialogs from "@/components/dialogs";
import FishSelectionDialog from "@/components/fish-selection-dialog";

// 定数
import { navigationItems } from "@/constants/navigation";

// 型定義
import { Fish } from "@/types/aquarium";

export default function HomePage() {
	const [activeTab, setActiveTab] = useState("home");
	const [showBirthDialog, setShowBirthDialog] = useState(false);
	const [newBornFish, setNewBornFish] = useState<Fish | null>(null);
	const [showFishSelectionDialog, setShowFishSelectionDialog] = useState(false);
	const [showLinkAquariumSelectionDialog, setShowLinkAquariumSelectionDialog] = useState(false);
	// 節約メーターの前回の値を記録するref（初期値-1で未初期化状態を表現）
	const previousConservationMeter = useRef<number>(-1);
	const router = useRouter();

	// カスタムフック
	const { user, authLoading, authError, signInWithGoogle, signInWithGoogleRedirect, handleSignOut } = useAuth();
	const { fishData, aquariumData, loading, fetchAquariumData } = useAquariumData(user);
	const { hatchEgg, releaseFish, discardEgg, processDailyUsage, forceProcessDailyUsage, updateFishStatus, resetFishStatus } = useAquariumApi(user);

	// Toast通知を表示する関数
	const showToast = (data: { processedDates: string[]; totalScoreAdded: number }) => {
		const message = `🌟 ${data.processedDates.length}日分のデータを一括処理しました！`;
		const description = `総合節約スコア: ${data.totalScoreAdded >= 0 ? '+' : ''}${data.totalScoreAdded}点`;

		if (data.totalScoreAdded > 0) {
			toast.success(message, { description, duration: 5000 });
		} else if (data.totalScoreAdded < 0) {
			toast.error(message, { description, duration: 5000 });
		} else {
			toast.info(message, { description, duration: 4000 });
		}
	};

	// 拡張されたAPI関数
	const handleHatchEgg = async () => {
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
	};

	const handleReleaseFish = async (fishId: string) => {
		const result = await releaseFish(fishId);
		if (!result) return;

		if (result.success) {
			console.log(`${result.data.releasedFish.fish_name}を手放しました`);
			// 水族館データを再取得して表示を更新
			await fetchAquariumData();
			// 取捨選択ダイアログを閉じる
			setShowFishSelectionDialog(false);
			// 卵の孵化を再実行
			await handleHatchEgg();
		}
	};

	const handleDiscardEgg = async (eggCount = 1) => {
		const result = await discardEgg(eggCount);
		if (!result) return;

		if (result.success) {
			console.log(`${result.data.discardedEggCount}個の卵を放棄しました`);
			// 水族館データを再取得して表示を更新
			await fetchAquariumData();
		}
	};

	const handleProcessDailyUsage = async () => {
		const responseData = await processDailyUsage();
		if (!responseData) return;

		if (responseData.success) {
			const data = responseData.data;

			// 初回ログインで処理されたデータがある場合のみメッセージを表示
			if (data.isFirstLoginToday && data.processedCount > 0) {
				showToast(data);
				// 水族館データを再取得して表示を更新
				await fetchAquariumData();
			} else if (data.isFirstLoginToday && data.processedCount === 0) {
				toast.info('🌟 今日初回ログインです！', {
					description: '処理対象の使用量データがありませんでした',
					duration: 3000,
				});
			}
		}
	};

	const handleForceProcessDailyUsage = useCallback(async () => {
		const responseData = await forceProcessDailyUsage();
		if (!responseData) return;

		if (responseData.success) {
			const data = responseData.data;
			const toastMessage = `🔧 dailyUsage処理を強制実行`;
			const toastDescription = data.processedCount > 0
				? `${data.processedCount}件処理 | スコア変化: ${data.totalScoreAdded >= 0 ? '+' : ''}${data.totalScoreAdded}点`
				: '処理対象データなし';

			if (data.totalScoreAdded > 0) {
				toast.success(toastMessage, { description: toastDescription, duration: 5000 });
			} else if (data.totalScoreAdded < 0) {
				toast.error(toastMessage, { description: toastDescription, duration: 5000 });
			} else {
				toast.info(toastMessage, { description: toastDescription, duration: 4000 });
			}

			// 水族館データを再取得して表示を更新
			await fetchAquariumData();
		} else {
			toast.error('🔧 デバッグ処理エラー', {
				description: responseData.error || '不明なエラー',
				duration: 5000,
			});
		}
	}, [forceProcessDailyUsage, fetchAquariumData]);

	// raising状態の魚選択ダイアログを表示する関数
	const handleSendFishToLinkAquarium = () => {
		if (!fishData || fishData.length === 0) return;

		// raising状態の魚を検索
		const raisingFish = fishData.filter(fish => fish.status === 'raising');

		if (raisingFish.length === 0) {
			toast.error('🐟 Link水槽に送る魚がありません', {
				description: 'raising状態の魚が見つかりませんでした',
				duration: 3000,
			});
			return;
		}

		// 魚選択ダイアログを表示
		setShowLinkAquariumSelectionDialog(true);
	};

	// 選択された魚をLink水槽に送る関数
	const handleSendSelectedFishToLinkAquarium = async (fishId: string) => {
		const selectedFish = fishData?.find(fish => fish.id === fishId);
		if (!selectedFish) return;

		try {
			const result = await updateFishStatus(fishId, 'inLinkAquarium');

			if (result && result.success) {
				const { resetToRaisingFish } = result.data;
				let description = `${selectedFish.fish_name}がLink水槽で泳いでいます`;

				// 他の魚がraisingに戻された場合の情報を追加
				if (resetToRaisingFish && resetToRaisingFish.length > 0) {
					const resetFishNames = resetToRaisingFish.map((fish: { id: string; fish_name: string }) => fish.fish_name).join(', ');
					description += `\n${resetFishNames}は水槽に戻りました`;
				}

				toast.success('🏊‍♀️ 魚をLink水槽に送りました！', {
					description: description,
					duration: 5000,
				});

				// 水族館データを再取得して表示を更新
				await fetchAquariumData();
			}
		} catch (error) {
			console.error('魚のステータス更新エラー:', error);
			toast.error('🔴 魚の移動に失敗しました', {
				description: error instanceof Error ? error.message : '不明なエラー',
				duration: 4000,
			});
		}
	};

	// 魚のステータスをログ出力する関数（デバッグ用）
	const handleLogFishStatus = () => {
		if (!fishData || fishData.length === 0) {
			console.log('🐟 魚データがありません');
			toast.info('🐟 魚データがありません', {
				description: '現在水槽に魚がいません',
				duration: 2000,
			});
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

		toast.info('🐟 魚ステータスをログ出力しました', {
			description: `総数: ${fishData.length}匹 | 詳細はコンソールを確認`,
			duration: 3000,
		});
	};

	// 魚のステータスをリセットする関数
	const handleResetFishStatus = async () => {
		if (!fishData || fishData.length === 0) {
			toast.info('🐟 リセットする魚がありません', {
				description: '現在水槽に魚がいません',
				duration: 2000,
			});
			return;
		}

		try {
			const result = await resetFishStatus();

			if (result && result.success) {
				const { updatedFishCount } = result.data;
				toast.success('🔄 魚ステータスをリセットしました！', {
					description: `${updatedFishCount}匹の魚をraisingに戻しました`,
					duration: 4000,
				});

				// 水族館データを再取得して表示を更新
				await fetchAquariumData();
			}
		} catch (error) {
			console.error('魚ステータスリセットエラー:', error);
			toast.error('🔴 魚ステータスのリセットに失敗しました', {
				description: error instanceof Error ? error.message : '不明なエラー',
				duration: 4000,
			});
		}
	};

	// ナビゲーション処理
	const handleNavigation = (tab: string) => {
		setActiveTab(tab);
		if (tab === "profile") {
			router.push("/profile");
		} else if (tab === "ranking") {
			router.push("/ranking");
		} else if (tab === "device") {
			// デバイス管理タブは同じページ内で表示
			setActiveTab("device");
		} else {
			router.push("/");
		}
	};

	useEffect(() => {
		if (user) {
			fetchAquariumData();
			// ログイン時にdailyUsageデータを自動処理
			handleProcessDailyUsage();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [user]);

	// 節約メーターの監視（デバッグ用）
	useEffect(() => {
		if (!user || !aquariumData) return;

		const currentMeter = aquariumData.conservationMeter;

		console.log(`=== 節約メーター監視（デバッグ用） ===`);
		console.log(`現在の節約メーター: ${currentMeter}`);
		console.log(`現在の環境レベル: ${aquariumData.enviromentLevel}`);

		// 前回の値を更新
		previousConservationMeter.current = currentMeter;
	}, [user, aquariumData]); // aquariumDataの変更を監視

	// 魚のステータス監視（デバッグ用）
	useEffect(() => {
		if (!user || !fishData || fishData.length === 0) return;

		console.log(`=== 魚ステータス監視（デバッグ用） ===`);
		console.log(`魚の総数: ${fishData.length}`);
		fishData.forEach((fish, index) => {
			console.log(`魚${index + 1}: ${fish.fish_name} | ステータス: ${fish.status} | 成長レベル: ${fish.growthLevel} | 卵メーター: ${fish.eggMeter}`);
		});

		const raisingFish = fishData.filter(fish => fish.status === 'raising');
		const inLinkAquariumFish = fishData.filter(fish => fish.status === 'inLinkAquarium');
		console.log(`raising状態の魚: ${raisingFish.length}匹`);
		console.log(`inLinkAquarium状態の魚: ${inLinkAquariumFish.length}匹`);
	}, [user, fishData]); // fishDataの変更を監視

	// 認証ローディング中
	if (authLoading) {
		return (
			<div className='min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center'>
				<div className='text-center'>
					<div className='text-6xl mb-4'>🐠</div>
					<p className='text-blue-600'>認証状態を確認中...</p>
				</div>
			</div>
		);
	}

	// ログインしていない場合のログイン画面
	if (!user) {
		return (
			<LoginScreen
				authError={authError}
				signInWithGoogle={signInWithGoogle}
				signInWithGoogleRedirect={signInWithGoogleRedirect}
			/>
		);
	}

	// データローディング中
	if (loading) {
		return (
			<div className='min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center'>
				<div className='text-center'>
					<div className='text-6xl mb-4'>🐠</div>
					<p className='text-blue-600'>水槽データを読み込み中...</p>
				</div>
			</div>
		);
	}

	return (
		<div className='min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex flex-col'>
			<header className='bg-white shadow-sm border-b border-gray-200 p-4'>
				<div className='max-w-6xl mx-auto flex items-center justify-between'>
					{/* Logo */}
					<div className='flex items-center space-x-2'>
						<Image
							src="/aquariumotion-icon.png"
							alt="AQUARIUMOTION"
							width={32}
							height={32}
							className="object-contain"
						/>
						<h1 className='text-xl font-bold text-gray-800'>AQUARIUMOTION</h1>
					</div>

					{/* User info and logout */}
					<div className='flex items-center space-x-4'>
						<div className='flex items-center space-x-2'>
							{(() => {
								console.log('=== UI レンダリング時の photoURL チェック ===');
								console.log('user.photoURL:', user.photoURL);
								console.log('user.photoURL type:', typeof user.photoURL);
								console.log('user.photoURL boolean:', !!user.photoURL);
								return user.photoURL ? (
									<Image
										src={user.photoURL}
										alt='User avatar'
										width={32}
										height={32}
										className='rounded-full'
										onLoad={() => console.log('✅ 画像読み込み成功:', user.photoURL)}
										onError={(e) => console.error('❌ 画像読み込み失敗:', user.photoURL, e)}

									/>
								) : (
									<div className='w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center'>
										<User className='w-4 h-4 text-gray-500' />
									</div>
								);
							})()}
							<span className='text-sm text-gray-700'>{user.displayName}</span>
						</div>
						<Button onClick={handleSignOut} variant='outline' size='sm'>
							ログアウト
						</Button>
					</div>
				</div>
			</header>

			<div className='flex-1 flex'>
				{/* メインコンテンツ */}
				<main className='flex-1 p-8'>
					<div className='max-w-6xl mx-auto'>
						{activeTab === "home" && (
							<div className='space-y-8'>
								{/* Unity水族館表示エリア */}
								<div className='bg-white rounded-2xl shadow-lg p-6'>
									<h2 className='text-xl font-semibold text-gray-800 mb-4 flex items-center'>
										🏛️ あなたの水族館
									</h2>
									<div className='aspect-video bg-gradient-to-b from-blue-100 to-blue-300 rounded-xl flex items-center justify-center'>
										{/* Unity Component */}
										<UnityComponent
											fishData={fishData}
											aquariumData={aquariumData}
										/>
									</div>
								</div>

								{/* 水槽環境レベル */}
								<AquariumLevel aquariumData={aquariumData} />

								{/* 卵の孵化ステータス */}
								<EggHatchingStatus
									aquariumData={aquariumData}
									hatchEgg={handleHatchEgg}
									discardEgg={handleDiscardEgg}
								/>

								{/* デバッグ・テスト用ツール */}
								<DebugTools
									forceProcessDailyUsage={handleForceProcessDailyUsage}
									logFishStatus={handleLogFishStatus}
									resetFishStatus={handleResetFishStatus}
									loading={loading}
								/>

								{/* 魚の成長ステータス */}
								<FishStatus
									fishData={fishData}
									aquariumData={aquariumData}
									hatchEgg={handleHatchEgg}
									discardEgg={handleDiscardEgg}
									sendFishToLinkAquarium={handleSendFishToLinkAquarium}
									loading={loading}
								/>

								{/* ダイアログ */}
								<Dialogs
									showBirthDialog={showBirthDialog}
									setShowBirthDialog={setShowBirthDialog}
									newBornFish={newBornFish}
									showFishSelectionDialog={showFishSelectionDialog}
									setShowFishSelectionDialog={setShowFishSelectionDialog}
									fishData={fishData}
									releaseFish={handleReleaseFish}
								/>

								{/* Link水槽用魚選択ダイアログ */}
								<FishSelectionDialog
									isOpen={showLinkAquariumSelectionDialog}
									onClose={() => setShowLinkAquariumSelectionDialog(false)}
									fishData={fishData || []}
									onSelectFish={handleSendSelectedFishToLinkAquarium}
									title="Link水槽に送る魚を選択"
									description="raising状態の魚の中から、Link水槽に送りたい魚を選んでください。"
									filterStatus="raising"
								/>
							</div>
						)}

						{activeTab === "device" && (
							<div className='space-y-6'>
								<div className='bg-white rounded-2xl shadow-lg p-6'>
									<h2 className='text-xl font-semibold text-gray-800 mb-6 flex items-center'>
										<Settings className="w-6 h-6 mr-2" />
										デバイス連携管理
									</h2>
									<DeviceManager />

									<div className="mt-8 pt-6 border-t border-gray-200">
										<h3 className="text-lg font-medium text-gray-700 mb-4">🔧 開発・テスト用ツール</h3>
										<p className="text-sm text-gray-600 mb-4">
											実際のESP32デバイスがない場合は、シミュレーターでテストできます。
										</p>
										<button
											onClick={() => window.open('/esp32-simulator', '_blank')}
											className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm"
										>
											🔌 ESP32シミュレーターを開く
										</button>
									</div>
								</div>
							</div>
						)}
					</div>
				</main>

				{/* ナビゲーションバー（右側） */}
				<nav className='w-20 bg-white shadow-lg border-l border-gray-200 flex flex-col items-center py-8 space-y-6'>
					{navigationItems.map((item) => {
						const Icon = item.icon;
						return (
							<button
								key={item.id}
								onClick={() => handleNavigation(item.id)}
								className={`p-3 rounded-xl transition-all duration-200 ${
									activeTab === item.id
										? "bg-blue-500 text-white shadow-md"
										: "text-gray-600 hover:bg-gray-100 hover:text-blue-500"
								}`}
								title={item.label}
							>
								<Icon size={24} />
							</button>
						);
					})}
				</nav>
			</div>
		</div>
	);
}