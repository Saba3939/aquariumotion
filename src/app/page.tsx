"use client";

import { useEffect, useState, useCallback } from "react";
import { Home, Trophy, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { getFirebaseDB, getFirebaseAuth, getGoogleProvider } from "@/lib/firebase";
import {
	collection,
	getDoc,
	doc,
	getDocs,
	Timestamp,
} from "firebase/firestore";
import {
	signOut,
	onAuthStateChanged,
	getRedirectResult,
	type User as FirebaseUser,
} from "firebase/auth";
import UnityComponent from "@/components/unitycomponent";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";

const navigationItems = [
	{ id: "home", label: "ホーム", icon: Home },
	{ id: "ranking", label: "ランキング", icon: Trophy },
	{ id: "profile", label: "プロフィール", icon: User },
];

// Firestore データ型定義
interface FirestoreFish {
	id: string;
	type_id: number;
	fish_name: string;
	status: string;
	eggMeter: number;
	growthLevel: number;
	birthDate: Timestamp;
}

interface FirestoreAquarium {
	enviromentLevel: number;
	conservationMeter: number;
	lastUpdated: Timestamp;
}

// React用のDate型定義
interface Fish {
	id: string;
	type_id: number;
	fish_name: string;
	status: string;
	eggMeter: number;
	growthLevel: number;
	birthDate: Timestamp;
}

interface Aquarium {
	enviromentLevel: number;
	conservationMeter: number;
	lastUpdated: Timestamp;
}

export default function HomePage() {
	const [fishData, setFishData] = useState<Fish[]>([]);
	const [aquariumData, setAquariumData] = useState<Aquarium | null>(null);
	const [activeTab, setActiveTab] = useState("home");
	const [loading, setLoading] = useState(false);
	const [showBirthDialog, setShowBirthDialog] = useState(false);
	const [newBornFish, setNewBornFish] = useState<Fish | null>(null);
	const [user, setUser] = useState<FirebaseUser | null>(null);
	const [authLoading, setAuthLoading] = useState(true);
	const [authError, setAuthError] = useState<string | null>(null);
	const router = useRouter();

	// 認証状態の監視
	useEffect(() => {
		console.log('認証状態監視開始');
		const auth = getFirebaseAuth();
		if (!auth) {
			console.error('Firebase認証の初期化に失敗しました');
			setAuthLoading(false);
			return;
		}
		
		let hasProcessedRedirect = false;
		
		// 認証状態の監視を開始
		const unsubscribe = onAuthStateChanged(auth, (user) => {
			console.log('認証状態変更:', user ? 'ログイン済み' : '未ログイン', user?.email);
			setUser(user);
			// リダイレクト処理が完了していない場合のみauthLoadingをfalseに
			if (hasProcessedRedirect) {
				setAuthLoading(false);
			}
		});
		
		// リダイレクト認証の結果をチェック
		getRedirectResult(auth)
			.then((result) => {
				hasProcessedRedirect = true;
				if (result) {
					console.log("リダイレクト認証成功:", result.user.email);
					setUser(result.user);
				} else {
					console.log("リダイレクト認証なし（通常のページロード）");
				}
				setAuthLoading(false);
			})
			.catch((error) => {
				hasProcessedRedirect = true;
				console.error("リダイレクト認証エラー:", error);
				setAuthError(`認証エラー: ${error.message}`);
				setAuthLoading(false);
			});
		
		return () => unsubscribe();
	}, []);

	// Googleでログイン
	const signInWithGoogle = async () => {
		console.log('ログイン処理開始');
		setAuthError(null); // エラーをリセット
		setAuthLoading(true); // ログイン処理中に設定
		
		const auth = getFirebaseAuth();
		const provider = getGoogleProvider();
		
		if (!auth || !provider) {
			const errorMsg = "Firebase認証の初期化に失敗しました。.env.localファイルの設定を確認してください。";
			console.error(errorMsg);
			console.error("auth:", auth);
			console.error("provider:", provider);
			setAuthError(errorMsg);
			return;
		}
		
		try {
			// 常にリダイレクト方式を使用（iframe制限完全回避）
			const { signInWithRedirect } = await import('firebase/auth');
			console.log("リダイレクト認証を開始します...");
			await signInWithRedirect(auth, provider);
		} catch (error: unknown) {
			const errorMsg = `ログインエラー: ${(error as { code?: string })?.code || 'UNKNOWN'} - ${(error as { message?: string })?.message || 'ネットワーク接続を確認してください'}`;
			console.error("ログインに失敗しました:", error);
			console.error("エラーコード:", (error as { code?: string })?.code);
			console.error("エラーメッセージ:", (error as { message?: string })?.message);
			setAuthError(errorMsg);
		}
	};

	// ログアウト
	const handleSignOut = async () => {
		const auth = getFirebaseAuth();
		if (!auth) {
			console.error("Firebase認証が利用できません");
			return;
		}
		
		try {
			await signOut(auth);
		} catch (error) {
			console.error("ログアウトに失敗しました:", error);
		}
	};

	const fetchAquariumData = useCallback(async () => {
		if (!user) return;
		
		const db = getFirebaseDB();
		if (!db) {
			console.error("Firestoreが利用できません");
			return;
		}

		try {
			setLoading(true);
			//水槽データの取得
			const aquariumRef = doc(db, "aquariums", user.uid);
			const aquariumSnap = await getDoc(aquariumRef);

			if (aquariumSnap.exists()) {
				const firestoreData = aquariumSnap.data() as FirestoreAquarium;
				// Timestamp を Date に変換
				const aquariumData: Aquarium = {
					enviromentLevel: firestoreData.enviromentLevel,
					conservationMeter: firestoreData.conservationMeter,
					lastUpdated: firestoreData.lastUpdated,
				};
				setAquariumData(aquariumData);
				console.log(aquariumData);
			} else {
				console.error("水槽データが見つかりません");
				setAquariumData({
					enviromentLevel: 0,
					conservationMeter: 0,
					lastUpdated: new Timestamp(0, 0),
				});
			}
			// 魚のデータの取得(サブコレクション)
			const fishCollectionRef = collection(db, "aquariums", user.uid, "fish");
			const fishSnapshot = await getDocs(fishCollectionRef);

			const fishList: Fish[] = [];
			fishSnapshot.forEach((doc) => {
				const firestoreData = doc.data() as Omit<FirestoreFish, "id">;
				// Timestamp を Date に変換
				const fishData: Fish = {
					id: doc.id,
					type_id: firestoreData.type_id,
					fish_name: firestoreData.fish_name,
					status: firestoreData.status,
					eggMeter: firestoreData.eggMeter,
					growthLevel: firestoreData.growthLevel,
					birthDate: firestoreData.birthDate,
				};
				fishList.push(fishData);
			});
			setFishData(fishList);
			console.log(fishList);
		} catch (error) {
			console.error("水槽データの取得に失敗しました", error);
		} finally {
			setLoading(false);
		}
	}, [user]);

	const hatchEgg = async () => {
		if (!user) return;
		try {
			const token = await user.getIdToken();
			const res = await fetch("/api/hatchegg", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
			});
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || "APIエラー");
			}
			await fetchAquariumData();
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error("たまご誕生APIエラー: " + error.message);
			} else {
				console.error("たまご誕生APIエラー: 不明なエラー");
			}
		}
	};

	// ナビゲーション処理
	const handleNavigation = (tab: string) => {
		setActiveTab(tab);
		if (tab === "profile") {
			router.push("/profile");
		} else if (tab === "ranking") {
			router.push("/ranking");
		} else {
			router.push("/");
		}
	};

	useEffect(() => {
		if (user) {
			fetchAquariumData();
		}
	}, [user, fetchAquariumData]);

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
			<div className='min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center'>
				<div className='bg-white rounded-2xl shadow-lg p-8 max-w-md w-full mx-4'>
					<div className='text-center mb-8'>
						<div className='text-6xl mb-4'>🐠</div>
						<h1 className='text-2xl font-bold text-gray-800 mb-2'>
							AQUARIUMOTION
						</h1>
						<p className='text-gray-600'>あなたの水槽にログインしてください</p>
					</div>
					{authError && (
						<div className='mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm'>
							<strong>ログインエラー:</strong> {authError}
						</div>
					)}
					{process.env.NODE_ENV === 'development' && (
						<details className='mb-4 text-xs text-gray-500'>
							<summary className='cursor-pointer hover:text-gray-700'>開発者向け情報</summary>
							<div className='mt-2 p-2 bg-gray-100 rounded text-left'>
								<p>Firebase設定状況:</p>
								<ul className='list-disc list-inside'>
									<li>API Key: {process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '設定済み' : '❌未設定'}</li>
									<li>Auth Domain: {process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? '設定済み' : '❌未設定'}</li>
									<li>Project ID: {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? '設定済み' : '❌未設定'}</li>
									<li>App ID: {process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? '設定済み' : '❌未設定'}</li>
								</ul>
							</div>
						</details>
					)}
					<Button
						onClick={signInWithGoogle}
						className='w-full bg-blue-500 hover:bg-blue-600 text-white py-3 text-lg'
					>
						Googleでログイン
					</Button>
				</div>
			</div>
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
						<h1 className='text-xl font-bold text-gray-800'>AQUARIUMOTION</h1>
					</div>

					{/* User info and logout */}
					<div className='flex items-center space-x-4'>
						<div className='flex items-center space-x-2'>
							<Image
								src={user.photoURL || "/default-avatar.png"}
								alt='User avatar'
								width={32}
								height={32}
								className='rounded-full'
							/>
							<span className='text-sm text-gray-700'>{user.displayName}</span>
						</div>
						<Button
							variant='outline'
							onClick={handleSignOut}
							className='text-sm'
						>
							ログアウト
						</Button>
					</div>
				</div>
			</header>

			{/* 既存のメインコンテンツ */}
			{/* Main Content - Unity WebGL Container */}
			<main className='flex-1 p-4'>
				<div className='max-w-6xl mx-auto space-y-6'>
					<div className='bg-white rounded-2xl shadow-lg overflow-hidden aspect-video'>
						<div className='w-full h-full bg-gradient-to-b from-blue-100 to-blue-200 flex items-center justify-center'>
							<UnityComponent fishData={fishData} aquariumData={aquariumData} />
						</div>
					</div>

					{/* Progress Meters - Updated design */}
					<div className='bg-white rounded-2xl shadow-lg p-6'>
						<div className='space-y-8'>
							{/* 節約メーター - Horizontal bar */}
							<div className='flex flex-col items-center space-y-3'>
								<div className='text-center'>
									<span className='text-lg font-semibold text-gray-700'>
										節約メーター
									</span>
									<div className='text-sm text-gray-500'>目標達成率</div>
								</div>
								<div className='w-full max-w-md'>
									<div className='flex justify-between items-center mb-2'>
										<span className='text-sm text-gray-500'>0%</span>
										<span className='text-lg font-bold text-blue-600'>
											{aquariumData?.conservationMeter}%
										</span>
										<span className='text-sm text-gray-500'>100%</span>
									</div>
									<div className='relative w-full h-6 bg-gray-200 rounded-full overflow-hidden'>
										<div
											className='absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-700 ease-out'
											style={{
												width: `${aquariumData?.conservationMeter}%`,
											}}
										>
											<div className='absolute inset-0 bg-gradient-to-r from-transparent to-white opacity-30 animate-pulse'></div>
										</div>
									</div>
								</div>
							</div>

							{/* たまごメーター - Three fish with their own egg meters */}
							<div className='flex flex-col items-center space-y-4'>
								<div className='text-center'>
									<span className='text-lg font-semibold text-gray-700'>
										魚たちのたまごメーター
									</span>
									<div className='text-sm text-gray-500'>
										各魚のたまごの進捗
									</div>
								</div>
								<div className='grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-2xl'>
									{fishData.map((fish, index) => (
										<div
											key={index}
											className='flex flex-col items-center space-y-3 p-4 border rounded-lg bg-gray-50 shadow-sm'
										>
											<div className='text-4xl mb-2'>🐟{index + 1}</div>{" "}
											{/* Fish icon */}
											<span className='text-md font-semibold text-gray-800'>
												{fish.fish_name}
											</span>
											<div className='flex items-center space-x-2'>
												{[1, 2, 3].map((eggNumber) => (
													<div
														key={eggNumber}
														className={`relative w-10 h-10 rounded-full border-2 transition-all duration-500 ${
															eggNumber <= fish.eggMeter
																? "bg-gradient-to-br from-blue-400 to-blue-500 shadow-md"
																: "bg-gray-100 border-gray-300"
														}`}
													>
														<div className='absolute inset-0 flex items-center justify-center'>
															{eggNumber <= fish.eggMeter ? (
																<span className='text-xl'>🥚</span>
															) : (
																<span className='text-xl opacity-30'>⭕</span>
															)}
														</div>
													</div>
												))}
											</div>
											<div className='text-xs text-gray-500 mt-1'>
												{fish.eggMeter === 3
													? "満タン！"
													: `あと${3 - fish.eggMeter}個`}
											</div>
											{/* たまごメーターが3の時だけDialogTriggerボタンを表示 */}
											{fish.eggMeter === 3 && (
												<Dialog
													open={showBirthDialog && newBornFish?.id === fish.id}
													onOpenChange={(open) => {
														setShowBirthDialog(open);
														if (!open) setNewBornFish(null);
													}}
												>
													<DialogTrigger asChild>
														<Button
															className='mt-2 px-4 py-1 bg-blue-500 text-white rounded-lg text-sm'
															onClick={() => {
																setNewBornFish(fish);
																setShowBirthDialog(true);
																hatchEgg();
															}}
														>
															誕生
														</Button>
													</DialogTrigger>
													<DialogContent>
														<DialogHeader>
															<DialogTitle>
																新しい魚が誕生しました！
															</DialogTitle>
															<DialogDescription>
																<div className='text-5xl mb-2'>🎉</div>
																<div className='text-lg mb-4'>
																	{fish.fish_name}
																</div>
															</DialogDescription>
														</DialogHeader>
														<Button
															onClick={async () => {
																setShowBirthDialog(false);
															}}
															className='w-full mt-4'
														>
															閉じる
														</Button>
													</DialogContent>
												</Dialog>
											)}
										</div>
									))}
								</div>
							</div>
						</div>
					</div>
				</div>
			</main>

			{/* Bottom Navigation */}
			<nav className='bg-white border-t border-gray-200 px-4 py-2'>
				<div className='max-w-6xl mx-auto'>
					<div className='flex justify-center space-x-8'>
						{navigationItems.map((item) => {
							const Icon = item.icon;
							const isActive = activeTab === item.id;
							return (
								<Button
									key={item.id}
									variant='ghost'
									className={`flex flex-col items-center space-y-1 p-3 rounded-xl transition-all ${
										isActive
											? "bg-blue-100 text-blue-600"
											: "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
									}`}
									onClick={() => handleNavigation(item.id)}
								>
									<Icon className='w-5 h-5' />
									<span className='text-xs font-medium'>{item.label}</span>
								</Button>
							);
						})}
					</div>
				</div>
			</nav>
		</div>
	);
}
