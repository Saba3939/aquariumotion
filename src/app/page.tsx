"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Home, Trophy, User, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
	signInWithPopup,
	type User as FirebaseUser,
} from "firebase/auth";
import UnityComponent from "@/components/unitycomponent";
import DeviceManager from "@/components/device-manager";
import {
	Dialog,
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
	{ id: "device", label: "デバイス管理", icon: Settings },
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
	unhatchedEggCount?: number; // たまごの孵化システム用（オプション）
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
	unhatchedEggCount: number; // たまごの孵化システム用
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
	const [showFishSelectionDialog, setShowFishSelectionDialog] = useState(false);
	// 節約メーターの前回の値を記録するref（初期値-1で未初期化状態を表現）
	const previousConservationMeter = useRef<number>(-1);
	const router = useRouter();

	// 認証状態の監視
	useEffect(() => {
		console.log('=== 認証初期化開始 ===');
		console.log('現在のドメイン:', window.location.hostname);
		console.log('URL:', window.location.href);
		console.log('Firebase設定:');
		console.log('- API Key:', process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '設定済み' : '未設定');
		console.log('- Auth Domain:', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
		console.log('- Project ID:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
		
		const auth = getFirebaseAuth();
		if (!auth) {
			console.error('Firebase認証の初期化に失敗しました');
			setAuthLoading(false);
			return;
		}
		
		console.log('Firebase認証初期化成功');
		
		// 認証状態の監視を開始
		const unsubscribe = onAuthStateChanged(auth, (user) => {
			console.log('=== 認証状態変更 ===');
			console.log('user:', user);
			console.log('ログイン状態:', user ? 'ログイン済み' : '未ログイン');
			if (user) {
				console.log('UID:', user.uid);
				console.log('メール:', user.email);
				console.log('表示名:', user.displayName);
				console.log('写真URL:', user.photoURL);
			}
			setUser(user);
			setAuthLoading(false);
		});
		
		// リダイレクト認証の結果をチェック
		getRedirectResult(auth)
			.then((result) => {
				console.log('=== リダイレクト結果 ===');
				console.log('result:', result);
				if (result) {
					console.log("✅ リダイレクト認証成功");
					console.log("ユーザー:", result.user);
					console.log("UID:", result.user.uid);
					console.log("メール:", result.user.email);
					console.log("表示名:", result.user.displayName);
					// 明示的にユーザーを設定
					setUser(result.user);
					setAuthLoading(false);
				} else {
					console.log("ℹ️ リダイレクト認証なし（通常のページロード）");
				}
			})
			.catch((error) => {
				console.log('=== リダイレクト認証エラー ===');
				console.error("エラー詳細:", error);
				console.error("エラーコード:", error?.code);
				console.error("エラーメッセージ:", error?.message);
				setAuthError(`認証エラー: ${error.message}`);
				setAuthLoading(false);
			});
		
		return () => unsubscribe();
	}, []);

	// Googleでログイン
	// ポップアップでログイン
	const signInWithGooglePopup = async () => {
		console.log('=== ポップアップログイン開始 ===');
		setAuthError(null);
		setAuthLoading(true);
		
		const auth = getFirebaseAuth();
		const provider = getGoogleProvider();
		
		if (!auth) {
			console.error('Firebase Auth初期化失敗');
			setAuthError('Firebase認証の初期化に失敗しました');
			setAuthLoading(false);
			return;
		}
		
		if (!provider) {
			console.error('Google Provider初期化失敗');
			setAuthError('Googleプロバイダーの初期化に失敗しました');
			setAuthLoading(false);
			return;
		}
		
		try {
			console.log('Firebase認証状況:', {
				authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
				apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '設定済み' : '未設定',
				currentDomain: window.location.hostname,
				currentOrigin: window.location.origin
			});
			
			console.log('ポップアップ認証実行中...');
			const result = await signInWithPopup(auth, provider);
			
			if (!result) {
				throw new Error('認証結果がnullまたはundefinedです');
			}
			
			if (!result.user) {
				throw new Error('ユーザー情報が取得できませんでした');
			}
			
			console.log('✅ ポップアップ認証成功:', {
				email: result.user.email,
				uid: result.user.uid,
				displayName: result.user.displayName,
				photoURL: result.user.photoURL
			});
			
			setUser(result.user);
			setAuthLoading(false);
		} catch (error: unknown) {
			console.error('ポップアップ認証エラー:', error);
			const errorCode = (error as { code?: string })?.code;
			const errorMsg = (error as { message?: string })?.message;
			
			let userFriendlyMessage = '';
			if (errorCode === 'auth/popup-closed-by-user') {
				userFriendlyMessage = 'ポップアップがユーザーによって閉じられました';
			} else if (errorCode === 'auth/popup-blocked') {
				userFriendlyMessage = 'ポップアップがブロックされました。ブラウザの設定を確認してください';
			} else if (errorCode === 'auth/unauthorized-domain') {
				userFriendlyMessage = 'このドメイン（' + window.location.hostname + '）は認証が許可されていません';
			} else if (errorCode === 'auth/operation-not-allowed') {
				userFriendlyMessage = 'Google認証が有効になっていません';
			} else {
				userFriendlyMessage = `ポップアップログインエラー: ${errorCode || 'unknown'} - ${errorMsg || 'undefined error'}`;
			}
			
			setAuthError(userFriendlyMessage);
			setAuthLoading(false);
		}
	};

	// リダイレクトでログイン
	const signInWithGoogleRedirect = async () => {
		console.log('=== リダイレクトログイン開始 ===');
		setAuthError(null);
		setAuthLoading(true);
		
		const auth = getFirebaseAuth();
		const provider = getGoogleProvider();
		
		if (!auth || !provider) {
			console.error('Firebase初期化失敗');
			setAuthError('Firebase認証の初期化に失敗しました');
			setAuthLoading(false);
			return;
		}
		
		try {
			const { signInWithRedirect } = await import('firebase/auth');
			console.log('リダイレクト認証実行中...');
			console.log('認証ドメイン:', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
			console.log('現在のドメイン:', window.location.hostname);
			await signInWithRedirect(auth, provider);
		} catch (error: unknown) {
			console.error('リダイレクト認証エラー:', error);
			const errorCode = (error as { code?: string })?.code;
			const errorMsg = (error as { message?: string })?.message;
			setAuthError(`リダイレクトログインエラー: ${errorCode} - ${errorMsg}`);
			setAuthLoading(false);
		}
	};

	// デフォルトはポップアップを使用
	const signInWithGoogle = signInWithGooglePopup;

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
					unhatchedEggCount: firestoreData.unhatchedEggCount || 0, // たまごの数を追加
				};
				setAquariumData(aquariumData);
				console.log(aquariumData);
			} else {
				console.error("水槽データが見つかりません");
				setAquariumData({
					enviromentLevel: 0,
					conservationMeter: 0,
					lastUpdated: new Timestamp(0, 0),
					unhatchedEggCount: 0, // デフォルト値を追加
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
	}, [user]);;
	// 初回ログイン時にdailyUsageデータを処理する関数
	const processDailyUsage = useCallback(async () => {
		if (!user) return;
		
		try {
			const token = await user.getIdToken();
			const res = await fetch('/api/process-daily-usage', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({})
			});
			
			const responseData = await res.json();
			
			if (res.ok && responseData.success) {
				const data = responseData.data;
				
				// 初回ログインで処理されたデータがある場合のみメッセージを表示
				if (data.isFirstLoginToday && data.processedCount > 0) {
					let message = `🌟 今日初回ログインのため、${data.processedDates.length}日分の使用量データを一括処理しました！\n`;
					message += `処理日: ${data.processedDates.join(', ')}\n`;
					message += `総合節約スコア: ${data.totalScoreAdded >= 0 ? '+' : ''}${data.totalScoreAdded}点`;
					
					console.log(message);
					
					// Toast通知を表示
					const toastMessage = `🌟 ${data.processedDates.length}日分のデータを一括処理しました！`;
					const toastDescription = `総合節約スコア: ${data.totalScoreAdded >= 0 ? '+' : ''}${data.totalScoreAdded}点`;
					
					if (data.totalScoreAdded > 0) {
						toast.success(toastMessage, {
							description: toastDescription,
							duration: 5000,
						});
					} else if (data.totalScoreAdded < 0) {
						toast.error(toastMessage, {
							description: toastDescription,
							duration: 5000,
						});
					} else {
						toast.info(toastMessage, {
							description: toastDescription,
							duration: 4000,
						});
					}
					
					// 水族館データを再取得して表示を更新
					await fetchAquariumData();
				} else if (data.isFirstLoginToday && data.processedCount === 0) {
					// 初回ログインだが処理するデータがなかった場合
					console.log('今日初回ログインですが、処理対象のデータがありませんでした');
					toast.info('🌟 今日初回ログインです！', {
						description: '処理対象の使用量データがありませんでした',
						duration: 3000,
					});
				} else {
					// 2回目以降のログイン
					console.log('本日は既にログイン済みです');
				}
				
				console.log('dailyUsage処理完了:', data);
			} else {
				console.log('dailyUsage処理結果:', responseData);
			}
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error('dailyUsage処理エラー: ' + error.message);
			} else {
				console.error('dailyUsage処理エラー: 不明なエラー');
			}
		}
	}, [user, fetchAquariumData]);;

	// デバッグ用：強制的にdailyUsage処理を実行する関数
	const forceProcessDailyUsage = useCallback(async () => {
		if (!user) return;
		
		try {
			const token = await user.getIdToken();
			const res = await fetch('/api/process-daily-usage', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
					'X-Force-Process': 'true', // 強制実行フラグ
				},
				body: JSON.stringify({})
			});
			
			const responseData = await res.json();
			
			if (res.ok && responseData.success) {
				const data = responseData.data;
				
				let message = `🔧 [デバッグ] dailyUsage処理を強制実行しました！\n`;
				message += `処理件数: ${data.processedCount}件\n`;
				if (data.processedDates && data.processedDates.length > 0) {
					message += `処理日: ${data.processedDates.join(', ')}\n`;
				}
				message += `総合節約スコア変化: ${data.totalScoreAdded >= 0 ? '+' : ''}${data.totalScoreAdded}点`;
				
				console.log(message);
				
				// Toast通知を表示
				const toastMessage = `🔧 dailyUsage処理を強制実行`;
				const toastDescription = data.processedCount > 0 
					? `${data.processedCount}件処理 | スコア変化: ${data.totalScoreAdded >= 0 ? '+' : ''}${data.totalScoreAdded}点`
					: '処理対象データなし';
				
				if (data.totalScoreAdded > 0) {
					toast.success(toastMessage, {
						description: toastDescription,
						duration: 5000,
					});
				} else if (data.totalScoreAdded < 0) {
					toast.error(toastMessage, {
						description: toastDescription,
						duration: 5000,
					});
				} else {
					toast.info(toastMessage, {
						description: toastDescription,
						duration: 4000,
					});
				}
				
				// 水族館データを再取得して表示を更新
				await fetchAquariumData();
			} else {
				console.log('強制dailyUsage処理結果:', responseData);
				toast.error('🔧 デバッグ処理エラー', {
					description: responseData.error || '不明なエラー',
					duration: 5000,
				});
			}
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error('強制dailyUsage処理エラー: ' + error.message);
				toast.error('🔧 デバッグ処理エラー', {
					description: error.message,
					duration: 5000,
				});
			} else {
				console.error('強制dailyUsage処理エラー: 不明なエラー');
				toast.error('🔧 デバッグ処理エラー', {
					description: '不明なエラーが発生しました',
					duration: 5000,
				});
			}
		}
	}, [user, fetchAquariumData]);

	const hatchEgg = async () => {
		if (!user) return;
		try {
			const token = await user.getIdToken();
			const res = await fetch("/api/hatch-egg", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({})
			});
			
			const responseData = await res.json();
			
			// 魚数上限に達している場合
			if (!res.ok && responseData.error === 'FISH_LIMIT_EXCEEDED') {
				// 取捨選択ダイアログを表示
				setShowFishSelectionDialog(true);
				return;
			}
			
			if (!res.ok) {
				throw new Error(responseData.error || "APIエラー");
			}
			
			// 新しい魚の情報を表示
			if (responseData.success && responseData.data?.newFish) {
				setNewBornFish(responseData.data.newFish);
				setShowBirthDialog(true);
			}
			
			// 水族館データを再取得して表示を更新
			await fetchAquariumData();
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error("たまご誕生APIエラー: " + error.message);
			} else {
				console.error("たまご誕生APIエラー: 不明なエラー");
			}
		}
	};
	// 魚を手放す関数
	const releaseFish = async (fishId: string) => {
		if (!user) return;
		
		try {
			const token = await user.getIdToken();
			const res = await fetch("/api/release-fish", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ fishId })
			});
			
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || "APIエラー");
			}
			
			const responseData = await res.json();
			
			if (responseData.success) {
				console.log(`${responseData.data.releasedFish.fish_name}を手放しました`);
				// 水族館データを再取得して表示を更新
				await fetchAquariumData();
				// 取捨選択ダイアログを閉じる
				setShowFishSelectionDialog(false);
				// 卵の孵化を再実行
				await hatchEgg();
			}
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error("魚リリースAPIエラー: " + error.message);
			} else {
				console.error("魚リリースAPIエラー: 不明なエラー");
			}
		}
	};
	// 卵を放棄する関数
	const discardEgg = async (eggCount = 1) => {
		if (!user) return;
		
		try {
			const token = await user.getIdToken();
			const res = await fetch("/api/discard-egg", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ eggCount })
			});
			
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || "APIエラー");
			}
			
			const responseData = await res.json();
			
			if (responseData.success) {
				console.log(`${responseData.data.discardedEggCount}個の卵を放棄しました`);
				// 水族館データを再取得して表示を更新
				await fetchAquariumData();
			}
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error("卵放棄APIエラー: " + error.message);
			} else {
				console.error("卵放棄APIエラー: 不明なエラー");
			}
		}
	};
	// 卵メーターが3に達した魚から卵を生成（手動実行用）
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const generateEggs = useCallback(async () => {
		if (!user) return;
		
		// eggMeterが3以上の魚があるかチェック
		const fishWithFullEggMeter = fishData.filter(fish => fish.eggMeter >= 3);
		if (fishWithFullEggMeter.length === 0) {
			return; // 卵を生成できる魚がない場合は何もしない
		}

		try {
			const token = await user.getIdToken();
			const res = await fetch("/api/generate-egg", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({})
			});
			
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || "APIエラー");
			}
			
			const responseData = await res.json();
			
			if (responseData.success) {
				console.log(`${responseData.data.generatedEggs}個の卵が生成されました！`);
				// 水族館データを再取得して表示を更新
				await fetchAquariumData();
				
				// 成功メッセージを表示（オプション）
				// alert(`🥚 ${responseData.data.generatedEggs}個の新しい卵が生成されました！`);
			}
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error("卵生成APIエラー: " + error.message);
			} else {
				console.error("卵生成APIエラー: 不明なエラー");
			}
		}
	}, [user, fishData, fetchAquariumData]);

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
			processDailyUsage();
		}
	}, [user, fetchAquariumData, processDailyUsage]);


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
					<details className='mb-4 text-xs text-gray-500'>
						<summary className='cursor-pointer hover:text-gray-700'>🔍 Firebase設定状況を確認</summary>
						<div className='mt-2 p-2 bg-gray-100 rounded text-left'>
							<p className='font-semibold mb-2'>Firebase設定状況:</p>
							<ul className='list-disc list-inside space-y-1'>
								<li>API Key: {process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '✅設定済み' : '❌未設定'}</li>
								<li>Auth Domain: {process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? '✅設定済み' : '❌未設定'} 
									{process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN && <span className='text-gray-400'>({process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN})</span>}
								</li>
								<li>Project ID: {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? '✅設定済み' : '❌未設定'}
									{process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && <span className='text-gray-400'>({process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID})</span>}
								</li>
								<li>Storage Bucket: {process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? '✅設定済み' : '❌未設定'}</li>
								<li>Messaging Sender ID: {process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ? '✅設定済み' : '❌未設定'}</li>
								<li>App ID: {process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? '✅設定済み' : '❌未設定'}</li>
							</ul>
							<div className='mt-2 pt-2 border-t border-gray-300'>
								<p className='font-semibold mb-1'>環境情報:</p>
								<ul className='list-disc list-inside space-y-1'>
									<li>現在のドメイン: <span className='text-gray-600'>{typeof window !== 'undefined' ? window.location.hostname : 'server'}</span></li>
									<li>現在のURL: <span className='text-gray-600'>{typeof window !== 'undefined' ? window.location.origin : 'server'}</span></li>
									<li>Node環境: <span className='text-gray-600'>{process.env.NODE_ENV || 'unknown'}</span></li>
								</ul>
							</div>
							<div className='mt-2 pt-2 border-t border-gray-300'>
								<p className='font-semibold mb-1'>⚠️ Firebase認証が失敗する場合:</p>
								<ol className='list-decimal list-inside space-y-1 text-gray-700'>
									<li>Firebase Consoleで認証済みドメインに以下を追加:
										<ul className='ml-4 mt-1'>
											<li>• aquariumotion.vercel.app</li>
											<li>• *.vercel.app</li>
										</ul>
									</li>
									<li>Google認証プロバイダーが有効になっているか確認</li>
								</ol>
							</div>
						</div>
					</details>
					<div className='space-y-3'>
						<Button
							onClick={signInWithGoogle}
							className='w-full bg-blue-500 hover:bg-blue-600 text-white py-3 text-lg'
						>
							Googleでログイン（ポップアップ）
						</Button>
						<Button
							onClick={signInWithGoogleRedirect}
							variant='outline'
							className='w-full border-blue-500 text-blue-500 hover:bg-blue-50 py-3 text-lg'
						>
							Googleでログイン（リダイレクト）
						</Button>
						<p className='text-xs text-gray-500 text-center'>
							ポップアップがブロックされる場合はリダイレクトをお試しください
						</p>
					</div>
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
								<div className='bg-white rounded-2xl shadow-lg p-6'>
									<h2 className='text-xl font-semibold text-gray-800 mb-4 flex items-center'>
										🌊 水槽環境レベル
									</h2>
									<div className='text-3xl font-bold text-blue-600 mb-2'>
										節約メーター {aquariumData?.conservationMeter || 0}
									</div>
									<div className='w-full bg-gray-200 rounded-full h-3'>
										<div
											className='bg-blue-500 h-3 rounded-full transition-all duration-300'
											style={{
												width: `${Math.min(
													((aquariumData?.conservationMeter || 0) % 100) || 0,
													100
												)}%`,
											}}
										></div>
									</div>
									<p className='text-sm text-gray-600 mt-2'>
										環境レベル {aquariumData?.enviromentLevel || 0} レベル
									</p>
								</div>

								{/* 卵の孵化ステータス */}
								<div className='bg-white rounded-2xl shadow-lg p-6'>
									<h2 className='text-xl font-semibold text-gray-800 mb-4 flex items-center'>
										🥚 卵の孵化
									</h2>
									<div className='flex items-center justify-between'>
										<div className='flex items-center space-x-3'>
											<div className='text-4xl'>🥚</div>
											<div>
												<div className='text-2xl font-bold text-orange-600'>
													{aquariumData?.unhatchedEggCount || 0} 個
												</div>
												<p className='text-sm text-gray-600'>孵化待ちの卵</p>
											</div>
										</div>
										<div>
											{(aquariumData?.unhatchedEggCount || 0) > 0 ? (
												<div className='flex flex-col gap-2'>
													<Button 
														onClick={hatchEgg} 
														className='bg-orange-500 hover:bg-orange-600 text-white px-6 py-2'
													>
														🐣 卵を孵化する
													</Button>
													<Button 
														onClick={() => discardEgg(1)} 
														variant="outline"
														className='border-red-300 text-red-600 hover:bg-red-50 px-6 py-2'
													>
														🗑️ 卵を放棄する
													</Button>
												</div>
											) : (
												<div className='text-gray-400 text-sm text-center'>
													<p>卵がありません</p>
													<p className='text-xs mt-1'>環境保護活動で卵を獲得しよう！</p>
												</div>
											)}
										</div>
									</div>
								</div>

								{/* デバッグ・テスト用ツール */}
								<div className='bg-white rounded-2xl shadow-lg p-6'>
									<h2 className='text-xl font-semibold text-gray-800 mb-4 flex items-center'>
										🔧 デバッグ・テスト用ツール
									</h2>
									<div className="flex flex-wrap gap-3">
										<Button
											onClick={forceProcessDailyUsage}
											variant="outline"
											className="border-blue-300 text-blue-600 hover:bg-blue-50"
											disabled={loading}
										>
											🔄 dailyUsage処理を強制実行
										</Button>
									</div>
									<p className="text-sm text-gray-500 mt-2">
										初回ログインチェックを無視してdailyUsage処理を強制実行します
									</p>
								</div>

								{/* 魚の成長ステータス */}
								<div className='bg-white rounded-2xl shadow-lg p-6'>
									<h2 className='text-xl font-semibold text-gray-800 mb-4 flex items-center'>
										🐠 魚のステータス
									</h2>
									{fishData.length > 0 ? (
										<div className='space-y-3'>
											{fishData.map((fish) => (
												<div
													key={fish.id}
													className={`flex items-center justify-between p-4 rounded-lg transition-all duration-300 ${
														fish.eggMeter >= 3 
															? 'bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-200 shadow-lg animate-pulse' 
															: 'bg-blue-50'
													}`}
												>
													<div className='flex items-center space-x-4'>
														<div className='text-4xl'>
															{/* Fish icon */}
															🐠
														</div>
														<div>
															<h3 className='font-medium text-gray-800'>
																{fish.fish_name}
															</h3>
															<p className='text-sm text-gray-600'>
																成長レベル: {fish.growthLevel} | 状態: {fish.status}
															</p>
														</div>
													</div>
													<div className='text-right'>
														<div className={`text-sm mb-2 ${
															fish.eggMeter >= 3 ? 'text-orange-600 font-semibold animate-bounce' : 'text-gray-600'
														}`}>
															{fish.eggMeter >= 3 ? '✨ エッグメーター満タン！' : 'エッグメーター'}
														</div>
														<div className='flex items-center gap-1'>
															{[...Array(3)].map((_, index) => (
																<div
																	key={index}
																	className={`w-6 h-8 rounded-full border-2 border-orange-300 flex items-center justify-center text-sm transition-all duration-300 ${
																		index < fish.eggMeter
																			? fish.eggMeter >= 3 
																				? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white shadow-lg border-yellow-300 animate-pulse'
																				: 'bg-orange-400 text-white'
																			: 'bg-orange-100'
																	}`}
																>
																</div>
															))}
														</div>
														<div className='text-xs text-gray-500 mt-1'>
															{fish.eggMeter}/3
														</div>
													</div>
												</div>
											))}
										</div>
									) : (
										<div className='text-center py-8 text-gray-500'>
											<p>まだ魚がいません。</p>
											{(aquariumData?.unhatchedEggCount || 0) > 0 ? (
												<div className='mt-4 space-y-3'>
													<div className='flex items-center justify-center space-x-2'>
														<span className='text-2xl'>🥚</span>
														<span className='text-lg font-medium text-gray-700'>
															孵化できる卵: {aquariumData?.unhatchedEggCount}個
														</span>
													</div>
													<div className='flex gap-3 justify-center'>
														<Button onClick={hatchEgg} className='bg-orange-500 hover:bg-orange-600'>
															🐣 卵を孵化する
														</Button>
														<Button 
															onClick={() => discardEgg(1)} 
															variant="outline"
															className='border-red-300 text-red-600 hover:bg-red-50'
														>
															🗑️ 卵を放棄する
														</Button>
													</div>
												</div>
											) : (
												<div className='mt-4 text-gray-400'>
													<p>卵がありません。環境保護活動を続けて卵を獲得しましょう！</p>
												</div>
											)}
										</div>
									)}
								</div>


								{/* 新規魚誕生ダイアログ */}
								{showBirthDialog && newBornFish && (
									<Dialog open={showBirthDialog} onOpenChange={setShowBirthDialog}>
										<DialogContent>
											<DialogHeader>
												<DialogTitle>🎉 新しい魚が誕生しました！</DialogTitle>
												<DialogDescription>
													<div className='text-center py-4'>
														<div className='text-6xl mb-4'>🐠</div>
														<p className='text-lg font-semibold'>
															{newBornFish.fish_name}
														</p>
														<p className='text-gray-600 mt-2'>
															あなたのエコ活動が新しい生命を育みました！
														</p>
													</div>
												</DialogDescription>
											</DialogHeader>
										</DialogContent>
									</Dialog>
								)}

								{/* 魚の取捨選択ダイアログ */}
								{showFishSelectionDialog && (
									<Dialog open={showFishSelectionDialog} onOpenChange={setShowFishSelectionDialog}>
										<DialogContent className="max-w-md">
											<DialogHeader>
												<DialogTitle>🐠 魚を手放してください</DialogTitle>
												<DialogDescription>
													水族館の上限は3匹です。新しい魚を迎えるために、既存の魚を1匹手放してください。
												</DialogDescription>
											</DialogHeader>
											<div className="space-y-3 mt-4">
												{fishData.map((fish) => (
													<div
														key={fish.id}
														className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
													>
														<div className="flex items-center space-x-3">
															<div className="text-3xl">🐠</div>
															<div>
																<h3 className="font-medium text-gray-800">
																	{fish.fish_name}
																</h3>
																<p className="text-sm text-gray-600">
																	成長レベル: {fish.growthLevel} | エッグメーター: {fish.eggMeter}/3
																</p>
															</div>
														</div>
														<Button
															onClick={() => releaseFish(fish.id)}
															variant="destructive"
															size="sm"
															className="bg-red-500 hover:bg-red-600"
														>
															手放す
														</Button>
													</div>
												))}
											</div>
											<div className="mt-4 text-center">
												<Button
													onClick={() => setShowFishSelectionDialog(false)}
													variant="outline"
													className="w-full"
												>
													キャンセル
												</Button>
											</div>
										</DialogContent>
									</Dialog>
								)}
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
