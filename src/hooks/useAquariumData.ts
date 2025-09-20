import { useState, useCallback } from "react";
import { type User as FirebaseUser } from "firebase/auth";
import { collection, getDoc, doc, getDocs, Timestamp } from "firebase/firestore";
import { getFirebaseDB } from "@/lib/firebase";
import { Fish, Aquarium, FirestoreAquarium, FirestoreFish } from "@/types/aquarium";

export const useAquariumData = (user: FirebaseUser | null) => {
	const [fishData, setFishData] = useState<Fish[]>([]);
	const [aquariumData, setAquariumData] = useState<Aquarium | null>(null);
	const [loading, setLoading] = useState(false);

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
	}, [user]);

	return {
		fishData,
		aquariumData,
		loading,
		fetchAquariumData,
	};
};