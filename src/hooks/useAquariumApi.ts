import { useCallback } from "react";
import { type User as FirebaseUser } from "firebase/auth";
import { Fish } from "@/types/aquarium";

export const useAquariumApi = (user: FirebaseUser | null) => {
	// たまご孵化API
	const hatchEgg = useCallback(async () => {
		if (!user) return null;
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
				return { error: 'FISH_LIMIT_EXCEEDED' };
			}

			if (!res.ok) {
				throw new Error(responseData.error || "APIエラー");
			}

			return responseData;
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error("たまご誕生APIエラー: " + error.message);
			} else {
				console.error("たまご誕生APIエラー: 不明なエラー");
			}
			throw error;
		}
	}, [user]);

	// 魚を手放す関数
	const releaseFish = useCallback(async (fishId: string) => {
		if (!user) return null;

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
			return responseData;
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error("魚リリースAPIエラー: " + error.message);
			} else {
				console.error("魚リリースAPIエラー: 不明なエラー");
			}
			throw error;
		}
	}, [user]);

	// 卵を放棄する関数
	const discardEgg = useCallback(async (eggCount = 1) => {
		if (!user) return null;

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
			return responseData;
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error("卵放棄APIエラー: " + error.message);
			} else {
				console.error("卵放棄APIエラー: 不明なエラー");
			}
			throw error;
		}
	}, [user]);

	// 卵メーターが3に達した魚から卵を生成（手動実行用）
	const generateEggs = useCallback(async (fishData: Fish[]) => {
		if (!user) return null;

		// eggMeterが3以上の魚があるかチェック
		const fishWithFullEggMeter = fishData.filter(fish => fish.eggMeter >= 3);
		if (fishWithFullEggMeter.length === 0) {
			return null; // 卵を生成できる魚がない場合は何もしない
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
			return responseData;
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error("卵生成APIエラー: " + error.message);
			} else {
				console.error("卵生成APIエラー: 不明なエラー");
			}
			throw error;
		}
	}, [user]);

	// dailyUsage処理
	const processDailyUsage = useCallback(async () => {
		if (!user) return null;

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
			return responseData;
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error('dailyUsage処理エラー: ' + error.message);
			} else {
				console.error('dailyUsage処理エラー: 不明なエラー');
			}
			throw error;
		}
	}, [user]);

	// デバッグ用：強制的にdailyUsage処理を実行する関数
	const forceProcessDailyUsage = useCallback(async () => {
		if (!user) return null;

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
			return responseData;
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error('強制dailyUsage処理エラー: ' + error.message);
			} else {
				console.error('強制dailyUsage処理エラー: 不明なエラー');
			}
			throw error;
		}
	}, [user]);

	// 魚のステータスを更新する関数
	const updateFishStatus = useCallback(async (fishId: string, newStatus: string) => {
		if (!user) return null;

		try {
			const token = await user.getIdToken();
			const res = await fetch("/api/update-fish-status", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ fishId, newStatus })
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || "APIエラー");
			}

			const responseData = await res.json();
			return responseData;
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error("魚ステータス更新APIエラー: " + error.message);
			} else {
				console.error("魚ステータス更新APIエラー: 不明なエラー");
			}
			throw error;
		}
	}, [user]);

	// 全ての魚のステータスをraisingにリセットする関数
	const resetFishStatus = useCallback(async () => {
		if (!user) return null;

		try {
			const token = await user.getIdToken();
			const res = await fetch("/api/reset-fish-status", {
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
			return responseData;
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error("魚ステータスリセットAPIエラー: " + error.message);
			} else {
				console.error("魚ステータスリセットAPIエラー: 不明なエラー");
			}
			throw error;
		}
	}, [user]);

	return {
		hatchEgg,
		releaseFish,
		discardEgg,
		generateEggs,
		processDailyUsage,
		forceProcessDailyUsage,
		updateFishStatus,
		resetFishStatus,
	};
};