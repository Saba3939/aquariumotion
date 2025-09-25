import { useState, useCallback, useEffect } from "react";
import { type User as FirebaseUser } from "firebase/auth";
import { collection, getDoc, doc, getDocs, Timestamp } from "firebase/firestore";
import { getFirebaseDB } from "@/lib/firebase";
import { Fish, Aquarium, FirestoreAquarium, FirestoreFish } from "@/types/aquarium";

export const useAquariumData = (user: FirebaseUser | null) => {
	const [fishData, setFishData] = useState<Fish[]>([]);
	const [aquariumData, setAquariumData] = useState<Aquarium | null>(null);
	const [loading, setLoading] = useState(false);
	const [isFirstTimeUser, setIsFirstTimeUser] = useState(false);
	const [initialFishName, setInitialFishName] = useState<string | null>(null);
	const [isInitializing, setIsInitializing] = useState(false);

	const initializeUserData = async () => {
		if (!user || isInitializing) {
			return { success: false };
		}

		setIsInitializing(true);

		try {
			const token = await user.getIdToken();

			let response: Response | null = null;
			let attempt = 0;
			const maxAttempts = 3;

			while (attempt < maxAttempts && !response?.ok) {
				attempt++;

				try {
					response = await fetch('/api/init-user', {
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${token}`,
							'Content-Type': 'application/json'
						}
					});
					
					if (response.ok) break;

					const errorData = await response.json();

					if (response.status === 400 && errorData.error?.includes('既に存在')) {
						return { success: true, isExistingUser: true };
					}

					if (attempt < maxAttempts) {
						await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
					}
				} catch (fetchError) {
					if (attempt === maxAttempts) throw fetchError;
					await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
				}
			}

			if (!response?.ok) {
				throw new Error(`API呼び出しが${maxAttempts}回失敗しました`);
			}

			const result = await response.json();
			
			const fishName = result.data?.initialFish?.fish_name;

			return { 
				success: true, 
				isNewUser: true, 
				initialFishName: fishName 
			};

		} catch (error) {
			console.error('初期データ作成エラー:', error);
			return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
		} finally {
			setIsInitializing(false);
		}
	};

	const createInitialFish = async () => {
		try {
			if (!user) {
				console.error('ユーザーが未認証です');
				return false;
			}

			const token = await user.getIdToken();
			const response = await fetch('/api/create-initial-fish', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				const errorData = await response.json();
				console.error('初期魚作成API失敗:', response.status, errorData);
				return false;
			}

			const result = await response.json();
			return true;
		} catch (error) {
			console.error('初期魚作成エラー:', error);
			return false;
		}
	};

	const fetchAquariumData = useCallback(async () => {
		if (!user || loading || isInitializing) {
			return;
		}

		const db = getFirebaseDB();
		if (!db) {
			console.error("Firestoreが利用できません");
			return;
		}

		try {
			setLoading(true);
			const aquariumRef = doc(db, "aquariums", user.uid);
			const aquariumSnap = await getDoc(aquariumRef);

			if (aquariumSnap.exists()) {
				const firestoreData = aquariumSnap.data() as FirestoreAquarium;
				const aquariumData: Aquarium = {
					enviromentLevel: firestoreData.enviromentLevel,
					conservationMeter: firestoreData.conservationMeter,
					lastUpdated: firestoreData.lastUpdated,
					unhatchedEggCount: firestoreData.unhatchedEggCount || 0,
				};
				setAquariumData(aquariumData);

			} else {
				const initResult = await initializeUserData();
				
				if (initResult.success) {
					if (initResult.isNewUser) {
						setIsFirstTimeUser(true);
						setInitialFishName(initResult.initialFishName || null);
					}

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
					}
				} else {
					console.error("初期データ作成に失敗しました。デフォルトデータを設定します。");
					setAquariumData({
						enviromentLevel: 50,
						conservationMeter: 50,
						lastUpdated: new Timestamp(0, 0),
						unhatchedEggCount: 0,
					});
				}
			}

			const fishCollectionRef = collection(db, "aquariums", user.uid, "fish");
			const fishSnapshot = await getDocs(fishCollectionRef);

			const fishList: Fish[] = [];
			fishSnapshot.forEach((doc) => {
				const firestoreData = doc.data() as Omit<FirestoreFish, "id">;
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

			if (aquariumSnap.exists() && fishList.length === 0) {
				const fishCreated = await createInitialFish();

				if (fishCreated) {
					const newFishSnapshot = await getDocs(fishCollectionRef);
					const newFishList: Fish[] = [];
					newFishSnapshot.forEach((doc) => {
						const firestoreData = doc.data() as Omit<FirestoreFish, "id">;
						const fishData: Fish = {
							id: doc.id,
							type_id: firestoreData.type_id,
							fish_name: firestoreData.fish_name,
							status: firestoreData.status,
							eggMeter: firestoreData.eggMeter,
							growthLevel: firestoreData.growthLevel,
							birthDate: firestoreData.birthDate,
						};
						newFishList.push(fishData);
					});
					setFishData(newFishList);
				}
			}
		} catch (error) {
			console.error("水槽データの取得に失敗しました", error);
		} finally {
			setLoading(false);
		}
	}, [user]);

	const resetFirstTimeUserFlag = useCallback(() => {
		setIsFirstTimeUser(false);
		setInitialFishName(null);
	}, []);

	const processLoginAndDailyUsage = useCallback(async () => {
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
			if (responseData.success) {
				// 処理完了
			}
		} catch (error) {
			console.error('processDailyUsageエラー:', error);
		}
	}, [user]);

	useEffect(() => {
		if (user && !loading && !isInitializing) {
			fetchAquariumData();
		}
	}, [user, fetchAquariumData]);

	return {
		fishData,
		aquariumData,
		loading,
		fetchAquariumData,
		isFirstTimeUser,
		initialFishName,
		resetFirstTimeUserFlag,
	};
};;;;
