"use client";

import { useEffect, useState, useRef } from "react";
import { User, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import UnityComponent from "@/components/unitycomponent";
import DeviceManager from "@/components/device-manager";

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
import ProfileContent from "@/components/profile-content";

// 定数
import { navigationItems } from "@/constants/navigation";

// ユーティリティ
import { showWelcomeToast } from "@/lib/toast-utils";

export default function HomePage() {
	const [activeTab, setActiveTab] = useState("home");
	// 節約メータの前回の値を記録するref（初期値-1で未初期化状態を表現）
	const previousConservationMeter = useRef<number>(-1);

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
		// すべてのタブを同じページ内で表示
	};

	useEffect(() => {
		if (user) {
			// ログイン時にdailyUsageデータを自動処理
			// fetchAquariumDataはuseAquariumDataフック内で自動実行されるため削除
			handleProcessDailyUsage();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [user]);

	// 節約メータの監視（デバッグ用）
	useEffect(() => {
		if (!user || !aquariumData) return;

		const currentMeter = aquariumData.conservationMeter;

		console.log(`=== 節約メータ監視（デバッグ用） ===`);
		console.log(`現在の節約メータ: ${currentMeter}`);
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
			console.log(`魚${index + 1}: ${fish.fish_name} | ステータス: ${fish.status} | 成長レベル: ${fish.growthLevel} | たまごメータ: ${fish.eggMeter}`);
		});

		const raisingFish = fishData.filter(fish => fish.status === 'raising');
		const inLinkAquariumFish = fishData.filter(fish => fish.status === 'inLinkAquarium');
		console.log(`raising状態の魚: ${raisingFish.length}匹`);
		console.log(`inLinkAquarium状態の魚: ${inLinkAquariumFish.length}匹`);
	}, [user, fishData]); // fishDataの変更を監視

	// 認証ローディング中
	if (authLoading) {
		return (
			<div className='min-h-screen bg-[#66B5D3] flex items-center justify-center relative overflow-hidden'>
				<div className='absolute inset-0 opacity-20'>
					<div className='absolute bottom-0 left-0 w-full h-64 bg-gradient-to-t from-blue-500/30 to-transparent animate-wave'></div>
				</div>
				<div className='text-center flex flex-col items-center relative z-10'>
					<div className='mb-4'>
						<Image src="/aquariumotion-icon.png" alt="logo" width={96} height={96} className="drop-shadow-2xl" />
					</div>
					<p className='text-xl font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent'>
						認証状態を確認中...
					</p>
					<div className='mt-4 flex gap-2'>
						<div className='w-3 h-3 bg-blue-500 rounded-full animate-bounce' style={{animationDelay: '0s'}}></div>
						<div className='w-3 h-3 bg-cyan-500 rounded-full animate-bounce' style={{animationDelay: '0.2s'}}></div>
						<div className='w-3 h-3 bg-teal-500 rounded-full animate-bounce' style={{animationDelay: '0.4s'}}></div>
					</div>
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
			<div className='min-h-screen bg-[#66B5D3] flex items-center justify-center relative overflow-hidden'>
				<div className='absolute inset-0 opacity-20'>
					<div className='absolute bottom-0 left-0 w-full h-64 bg-gradient-to-t from-blue-500/30 to-transparent animate-wave'></div>
				</div>
				<div className='text-center flex flex-col items-center relative z-10'>
					<div className='mb-4'>
						<Image src="/aquariumotion-icon.png" alt="logo" width={96} height={96} className="drop-shadow-2xl" />
					</div>
					<p className='text-xl font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent'>
						水槽データを読み込み中...
					</p>
					<div className='mt-4 flex gap-2'>
						<div className='w-3 h-3 bg-blue-500 rounded-full animate-bounce' style={{animationDelay: '0s'}}></div>
						<div className='w-3 h-3 bg-cyan-500 rounded-full animate-bounce' style={{animationDelay: '0.2s'}}></div>
						<div className='w-3 h-3 bg-teal-500 rounded-full animate-bounce' style={{animationDelay: '0.4s'}}></div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className='min-h-screen bg-[#66B5D3] flex flex-col pb-20 md:pb-0'>
			{/* ヘッダー */}
			<header className='bg-white shadow-md border-b border-gray-200 sticky top-0 z-50'>
				<div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4'>
					<div className='flex items-center justify-between'>
						{/* Logo */}
						<div className='flex items-center space-x-3'>
							<Image
								src="/aquariumotion-icon.png"
								alt="AQUARIUMOTION"
								width={48}
								height={48}
								className="object-contain"
							/>
							<div>
								<h1 className='text-2xl font-bold text-gray-800 tracking-wide'>
									AQUARIUMOTION
								</h1>
							</div>
						</div>

						{/* User info and logout */}
						<div className='flex items-center space-x-3 sm:space-x-4'>
								{(() => {
									return user.photoURL ? (
										<Image
											src={user.photoURL}
											alt='User avatar'
											width={36}
											height={36}
											className='rounded-full '
											onLoad={() => console.log('✅ 画像読み込み成功:', user.photoURL)}
											onError={(e) => console.error('❌ 画像読み込み失敗:', user.photoURL, e)}
										/>
									) : (
										<div className='w-9 h-9 rounded-full flex items-center justify-center'>
											<User className='w-5 h-5' />
										</div>
									);
								})()}
							<Button
								onClick={handleSignOut}
                className="bg-[#66B5D3]"
								size='sm'
							>
								ログアウト
							</Button>
						</div>
					</div>
				</div>
			</header>

			<div className='flex-1 flex flex-col'>
				{/* メインコンテンツ */}
				<main className='w-full p-4 sm:p-6 lg:p-8 overflow-y-auto'>
					<div className='max-w-6xl mx-auto'>
						{activeTab === "home" && (
							<div className='space-y-6'>
								{/* Unity水族館表示エリア */}
								<div className='glass rounded-3xl shadow-2xl p-6 border border-white/40 transition-smooth hover:shadow-3xl'>
									<h2 className='text-2xl font-bold mb-4'>
										<span className='bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent'>
											me水槽
										</span>
									</h2>
									<div className='aspect-video bg-gradient-to-b from-blue-100 via-cyan-100 to-teal-200 rounded-2xl overflow-hidden shadow-inner border-2 border-blue-200/50'>
										{/* Unity Component */}
										<UnityComponent
											fishData={fishData}
											aquariumData={aquariumData}
										/>
									</div>
								</div>

								{/* 水槽環境レベル */}
								<AquariumLevel aquariumData={aquariumData} />

								{/* たまごの孵化ステータス */}
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
								<div className='glass rounded-3xl shadow-xl p-6 border border-white/40 transition-smooth hover:shadow-2xl'>
									<h2 className='text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2'>
										<Settings className="w-7 h-7 text-blue-600" />
										<span className='bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent'>
											ICカード設定
										</span>
									</h2>
									<ICCardRegistration user={user} />
								</div>

								{/* デバイス連携管理 */}
								<div className='glass rounded-3xl shadow-xl p-6 border border-white/40 transition-smooth hover:shadow-2xl'>
									<h2 className='text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2'>
										<Settings className="w-7 h-7 text-cyan-600" />
										<span className='bg-gradient-to-r from-cyan-600 to-teal-600 bg-clip-text text-transparent'>
											デバイス連携管理
										</span>
									</h2>
									<DeviceManager />
								</div>
							</div>
						)}

						{activeTab === "profile" && (
							<ProfileContent user={user} handleSignOut={handleSignOut} />
						)}
					</div>
				</main>
			</div>

			{/* デスクトップ用ナビゲーション（右側） */}
			<nav className='hidden md:flex w-20 bg-[#66B5D3] backdrop-blur-md flex-col items-center justify-center py-8 space-y-6 fixed right-0 top-[88px] bottom-0 z-40'>
				{navigationItems.map((item) => {
					const Icon = item.icon;
					return (
						<button
							key={item.id}
							onClick={() => handleNavigation(item.id)}
							className={`p-3 rounded-xl transition-smooth transform hover:scale-110 ${
								activeTab === item.id
									? "bg-white/20 text-white shadow-lg"
									: "text-white hover:bg-white/10"
							}`}
							title={item.label}
						>
							<Icon size={24} />
						</button>
					);
				})}
			</nav>

			{/* モバイル用ボトムナビゲーション */}
			<nav className='md:hidden fixed bottom-0 left-0 right-0 bg-[#66B5D3] backdrop-blur-md shadow-2xl z-50'>
				<div className='flex justify-around items-center py-2 px-4 max-w-md mx-auto'>
					{navigationItems.map((item) => {
						const Icon = item.icon;
						return (
							<button
								key={item.id}
								onClick={() => handleNavigation(item.id)}
								className={`flex flex-col items-center py-2 px-4 rounded-xl transition-smooth ${
									activeTab === item.id
										? "bg-white/20 text-white shadow-lg scale-105"
										: "text-white hover:bg-white/10"
								}`}
							>
								<Icon size={22} />
								<span className='text-xs mt-1 font-medium'>{item.label}</span>
							</button>
						);
					})}
				</div>
			</nav>

			{/* 初回ユーザー向けウェルカムダイアログ */}
			<WelcomeDialog
				isOpen={isFirstTimeUser}
				onClose={handleWelcomeDialogClose}
				fishName={initialFishName || undefined}
			/>
		</div>
	);
}
