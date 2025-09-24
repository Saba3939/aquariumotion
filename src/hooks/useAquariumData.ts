import { useState, useCallback, useEffect } from "react";
import { type User as FirebaseUser } from "firebase/auth";
import { collection, getDoc, doc, getDocs, Timestamp } from "firebase/firestore";
import { getFirebaseDB } from "@/lib/firebase";
import { Fish, Aquarium, FirestoreAquarium, FirestoreFish } from "@/types/aquarium";

export const useAquariumData = (user: FirebaseUser | null) => {
	const [fishData, setFishData] = useState<Fish[]>([]);
	const [aquariumData, setAquariumData] = useState<Aquarium | null>(null);
	const [loading, setLoading] = useState(false);
	const [isFirstTimeUser, setIsFirstTimeUser] = useState(false); // 初回ユーザーフラグ
	const [initialFishName, setInitialFishName] = useState<string | null>(null); // 初期魚の名前
	const [isInitializing, setIsInitializing] = useState(false); // 初期化中フラグ

	// 新規ユーザー用の初期データ作成API呼び出し
	const initializeUserData = async () => {
		if (!user) {
			console.log('初期化スキップ: ユーザーが未認証');
			return { success: false };
		}

		if (isInitializing) {
			console.log('初期化スキップ: 既に初期化中');
			return { success: false };
		}

		setIsInitializing(true);

		try {
			console.log('=== 初期データ作成API呼び出し開始 ===');
			console.log('ユーザーID:', user.uid);

			const token = await user.getIdToken();
			console.log('IDトークン取得完了');

			const response = await fetch('/api/init-user', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json'
				}
			});

			console.log('API レスポンス状態:', response.status, response.statusText);

			if (!response.ok) {
				const errorData = await response.json();
				console.error('初期データ作成エラー詳細:', {
					status: response.status,
					error: errorData.error,
					fullResponse: errorData
				});

				// 既にデータが存在する場合は正常扱い
				if (response.status === 400 && errorData.error?.includes('既に存在')) {
					console.log('水族館データが既に存在するため、初期化をスキップ');
					return { success: true, isExistingUser: true };
				}

				return { success: false };
			}

			const result = await response.json();
			console.log('新規ユーザーの初期データを作成しました:', result.data);
			
			// 初期魚の名前を記録
			const fishName = result.data?.initialFish?.fish_name;
			return { 
				success: true, 
				isNewUser: true, 
				initialFishName: fishName 
			};
		} catch (error) {
			console.error('初期データ作成API呼び出しエラー:', error);
			return { success: false };
		} finally {
			setIsInitializing(false);
		}
	};

	const fetchAquariumData = useCallback(async () => {
		if (!user) return;

		if (loading || isInitializing) {
			console.log('データ取得スキップ: 既に処理中');
			return;
		}

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
				console.log('✅ 既存の水族館データを取得:', aquariumData);
				console.log('🐟 既存ユーザーのため初期化APIは呼び出しません');
			} else {
				// 水族館データが存在しない場合、新規ユーザーとして初期データを作成
				console.log("新規ユーザーを検出しました。初期データを作成します...");
				const initResult = await initializeUserData();
				
				if (initResult.success) {
					// 新規ユーザーの場合、フラグを設定
					if (initResult.isNewUser) {
						setIsFirstTimeUser(true);
						setInitialFishName(initResult.initialFishName || null);
						console.log('初回ユーザー検出 - ウェルカムダイアログを表示予定');
					}

					// 初期データ作成後、再度データを取得
					const newAquariumSnap = await getDoc(aquariumRef);
					if (newAquariumSnap.exists()) {
						const firestoreData = newAquariumSnap.data() as FirestoreAquarium;
						const aquariumData: Aquarium = {
							enviromentLevel: firestoreData.enviromentLevel,
							conservationMeter: firestoreData.conservationMeter,
							lastUpdated: firestoreData.lastUpdated,
							unhatchedEggCount: firestoreData.unhatchedEggCount || 0,
						};
						setAquariumData(aquariumData);
						console.log('初期化後の水族館データ:', aquariumData);
					}
				} else {
					// 初期データ作成に失敗した場合のフォールバック
					console.error("初期データ作成に失敗しました。デフォルトデータを設定します。");
					setAquariumData({
						enviromentLevel: 1,
						conservationMeter: 0,
						lastUpdated: new Timestamp(0, 0),
						unhatchedEggCount: 0,
					});
				}
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
			console.log('取得した魚データ:', fishList);
		} catch (error) {
			console.error("水槽データの取得に失敗しました", error);
		} finally {
			setLoading(false);
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [user]); // loadingとisInitializingを依存配列から削除（無限ループ防止）

	// 初回ユーザーフラグをリセットする関数
	const resetFirstTimeUserFlag = useCallback(() => {
		setIsFirstTimeUser(false);
		setInitialFishName(null);
	}, []);

	// processDailyUsageを実行する関数
	const processLoginAndDailyUsage = useCallback(async () => {
		if (!user) return;

		try {
			console.log('=== ログイン時処理: processDailyUsageを実行 ===');
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
			if (responseData.success) {
				console.log('✅ processDailyUsage完了:', responseData.data);
				// lastLoginが更新されたので、必要に応じて水族館データを再取得
				if (responseData.data.isFirstLoginToday && responseData.data.processedCount > 0) {
					console.log('🔄 初回ログインで処理データがあるため水族館データを再取得');
					// fetchAquariumDataは既に実行されているはずなので、少し待ってから再実行
					setTimeout(fetchAquariumData, 1000);
				}
			}
		} catch (error) {
			console.error('processDailyUsageエラー:', error);
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [user]); // fetchAquariumDataを依存関係に含めると無限ループのリスクがあるため除外

	// userが変更された時に自動的にデータ取得とログイン処理
	useEffect(() => {
		if (user && !loading && !isInitializing) {
			console.log('=== useAquariumData: ユーザー変更検出、データ取得とログイン処理開始 ===');
			fetchAquariumData();
			// データ取得後にprocessDailyUsageを実行
			setTimeout(() => {
				processLoginAndDailyUsage();
			}, 500); // データ取得完了を待ってから実行
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [user]); // userが変更された時のみ実行したいため、他の依存関係は意図的に除外

	return {
		fishData,
		aquariumData,
		loading,
		fetchAquariumData,
		isFirstTimeUser,
		initialFishName,
		resetFirstTimeUserFlag,
	};
};;;
