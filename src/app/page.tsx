"use client";

import { useEffect, useState, useRef } from "react";
import { User, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import UnityComponent from "@/components/unitycomponent";
import DeviceManager from "@/components/device-manager";
import { useRouter } from "next/navigation";

// カスタムフック
import { useAuth } from "@/hooks/useAuth";
import { useAquariumData } from "@/hooks/useAquariumData";
import { useAquariumHandlers } from "@/hooks/useAquariumHandlers";

// コンポーネント
import LoginScreen from "@/components/login-screen";
import AquariumLevel from "@/components/aquarium-level";
import EggHatchingStatus from "@/components/egg-hatching-status";
import FishStatus from "@/components/fish-status";
import DebugTools from "@/components/debug-tools";
import Dialogs from "@/components/dialogs";
import FishSelectionDialog from "@/components/fish-selection-dialog";
import WelcomeDialog from "@/components/welcome-dialog";
import ICCardRegistration from "@/components/ic-card-registration";

// 定数
import { navigationItems } from "@/constants/navigation";

// ユーティリティ
import { showWelcomeToast } from "@/lib/toast-utils";

export default function HomePage() {
	const [activeTab, setActiveTab] = useState("home");
	// 節約メーターの前回の値を記録するref（初期値-1で未初期化状態を表現）
	const previousConservationMeter = useRef<number>(-1);
	const router = useRouter();

	// カスタムフック
	const { user, authLoading, authError, signInWithGoogle, signInWithGoogleRedirect, handleSignOut } = useAuth();
	const { fishData, aquariumData, loading, fetchAquariumData, isFirstTimeUser, initialFishName, resetFirstTimeUserFlag } = useAquariumData(user);

	// ハンドラー関連のフック
	const {
		showBirthDialog,
		setShowBirthDialog,
		newBornFish,
		showFishSelectionDialog,
		setShowFishSelectionDialog,
		showLinkAquariumSelectionDialog,
		setShowLinkAquariumSelectionDialog,
		handleHatchEgg,
		handleReleaseFish,
		handleDiscardEgg,
		handleProcessDailyUsage,
		handleForceProcessDailyUsage,
		handleSendFishToLinkAquarium,
		handleSendSelectedFishToLinkAquarium,
		handleLogFishStatus,
		handleResetFishStatus,
	} = useAquariumHandlers({ user, fishData, fetchAquariumData });

	// 初回ユーザー向けウェルカムダイアログを閉じる時の処理
	const handleWelcomeDialogClose = () => {
		resetFirstTimeUserFlag();
		// 初回ログイン時のtoastを表示
		showWelcomeToast(initialFishName || undefined);
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
			// ログイン時にdailyUsageデータを自動処理
			// fetchAquariumDataはuseAquariumDataフック内で自動実行されるため削除
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
				<div className='text-center flex flex-col items-center'>
          <Image src="/aquariumotion-icon.png" alt="logo" width={64} height={64} className="mb-2"></Image>
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
				<div className='text-center flex flex-col items-center'>
          <Image src="/aquariumotion-icon.png" alt="logo" width={64} height={64} className="mb-2"></Image>
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
                    me水槽
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


								{/* 魚の成長ステータス */}
								<FishStatus
									fishData={fishData}
									aquariumData={aquariumData}
									hatchEgg={handleHatchEgg}
									discardEgg={handleDiscardEgg}
									sendFishToLinkAquarium={handleSendFishToLinkAquarium}
									loading={loading}
								/>

								{/* デバッグ・テスト用ツール */}
								<DebugTools
									forceProcessDailyUsage={handleForceProcessDailyUsage}
									logFishStatus={handleLogFishStatus}
									resetFishStatus={handleResetFishStatus}
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
								{/* ICカード登録 */}
								<div className='bg-white rounded-2xl shadow-lg p-6'>
									<h2 className='text-xl font-semibold text-gray-800 mb-6 flex items-center'>
										<Settings className="w-6 h-6 mr-2" />
										ICカード設定
									</h2>
									<ICCardRegistration user={user} />
								</div>

								{/* デバイス連携管理 */}
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

			{/* 初回ユーザー向けウェルカムダイアログ */}
			<WelcomeDialog
				isOpen={isFirstTimeUser}
				onClose={handleWelcomeDialogClose}
				fishName={initialFishName || undefined}
			/>
		</div>
	);
}
