import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getDB } from "@/lib/firebase-server";
import { calculateConservationScore } from "@/lib/conservation-score";
import { createSuccessResponse, createErrorResponse } from "@/lib/validation";
import * as admin from "firebase-admin";

/**
 * ユーザーの電気デバイス情報を取得する
 */
async function getUserElectricityDeviceInfo(userId: string) {
  const db = getDB();
  if (!db) return null;

  try {
    const devicesSnapshot = await db
      .collection("devices")
      .where("userId", "==", userId)
      .where("deviceType", "==", "electricity")
      .where("isActive", "==", true)
      .get();

    if (devicesSnapshot.empty) {
      return null;
    }

    // 最新のlastSeenを持つデバイスを取得
    let latestDevice = null;
    let latestLastSeen = null;

    for (const doc of devicesSnapshot.docs) {
      const deviceData = doc.data();
      const lastSeen = deviceData.lastSeen;

      if (!latestLastSeen || (lastSeen && lastSeen.toDate() > latestLastSeen)) {
        latestDevice = deviceData;
        latestLastSeen = lastSeen ? lastSeen.toDate() : null;
      }
    }

    return {
      deviceId: latestDevice?.deviceId || null,
      lastSeen: latestLastSeen
    };
  } catch (error) {
    console.error("電気デバイス情報取得エラー:", error);
    return null;
  }
}

/**
 * ログイン時にdailyUsageデータを処理して節約スコアを自動加算するAPI
 * POST /api/process-daily-usage
 */
export async function POST(request: NextRequest) {
	try {
		// 認証確認 - IDトークンを取得
		const authHeader = request.headers.get("authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return NextResponse.json(
				createErrorResponse("UNAUTHORIZED", "認証が必要です", 401),
				{ status: 401 }
			);
		}

		const idToken = authHeader.substring(7);
		const decodedToken = await verifyIdToken(idToken);
		if (!decodedToken) {
			return NextResponse.json(
				createErrorResponse("UNAUTHORIZED", "無効な認証トークンです", 401),
				{ status: 401 }
			);
		}

		const userId = decodedToken.uid;

		const db = getDB();
		if (!db) {
			return NextResponse.json(
				createErrorResponse("DATABASE_ERROR", "データベース接続エラー", 500),
				{ status: 500 }
			);
		}

		// 強制実行フラグをチェック
		const forceProcess = request.headers.get("X-Force-Process") === "true";

		// 今日の日付を取得
		const today = new Date();
		const todayString = today.toISOString().split("T")[0]; // YYYY-MM-DD

		// ユーザー情報を取得または作成
		const userRef = db.collection("users").doc(userId);
		const userDoc = await userRef.get();

		let lastLogin = "";
		let isFirstLoginToday = true;

		if (userDoc.exists) {
			const userData = userDoc.data()!;
			lastLogin = userData.lastLogin || "";
			isFirstLoginToday = lastLogin !== todayString;
		}

		// 強制実行の場合は初回ログインフラグを強制的にtrueにする
		if (forceProcess) {
			isFirstLoginToday = true;
		}

		// 現在の水族館データを取得
		const aquariumRef = db.collection("aquariums").doc(userId);
		const aquariumDoc = await aquariumRef.get();

		if (!aquariumDoc.exists) {
			// 水族館データがない場合は初回ログインとして作成
			const initialAquariumData = {
				enviromentLevel: 50,
				conservationMeter: 50, // 初期値50
				unhatchedEggCount: 0,
				lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
			};
			await aquariumRef.set(initialAquariumData);
		}

		const processedDates: string[] = [];
		let totalScoreAdded = 0;
		let processedCount = 0;

		// その日初回ログインの場合のみ、前日までの未処理データを一括処理
		if (isFirstLoginToday) {

			// インデックス不要なシンプルクエリ: userIdのみで取得
			const dailyUsageSnapshot = await db
				.collection("dailyUsage")
				.where("userId", "==", userId)
				.get();

			// クライアントサイドで日付フィルタリングと未処理チェック
			const unprocessedDocs = dailyUsageSnapshot.docs.filter((doc) => {
				const data = doc.data();
				const docDate = data.date || "";
				// 今日より前の日付 かつ conservationScoreが未設定
				return (
					docDate < todayString &&
					(data.conservationScore === undefined ||
						data.conservationScore === null)
				);
			});

			if (unprocessedDocs.length > 0) {

				// 日付ごとにグループ化して総合スコアを算出
				const dateGroups = new Map<
					string,
					{
						docs: FirebaseFirestore.QueryDocumentSnapshot[];
						totalWater: number;
						totalElectricity: number;
					}
				>();

				for (const doc of unprocessedDocs) {
					const dailyData = doc.data();
					const date = dailyData.date;

					if (!dateGroups.has(date)) {
						dateGroups.set(date, {
							docs: [],
							totalWater: 0,
							totalElectricity: 0,
						});
					}

					const dateGroup = dateGroups.get(date)!;
					dateGroup.docs.push(doc);
					dateGroup.totalWater += dailyData.waterUsage || 0;
					dateGroup.totalElectricity += dailyData.electricityUsage || 0;
				}

				const batch = db.batch();

				// 日付順にソートして処理
				const sortedDates = Array.from(dateGroups.keys()).sort();

				// ユーザーの電気デバイス情報を取得
				const electricityDeviceInfo = await getUserElectricityDeviceInfo(userId);

				for (const date of sortedDates) {
					const dateGroup = dateGroups.get(date)!;

					// その日のelectricityDeviceActiveの状態をチェック
					let electricityDeviceWasActive = false;
					for (const doc of dateGroup.docs) {
						const dailyData = doc.data();
						if (dailyData.electricityDeviceActive === true) {
							electricityDeviceWasActive = true;
							break;
						}
					}

					// electricityDeviceActiveがtrueでない場合、電気使用量を基準値として処理
					let adjustedElectricityUsage = dateGroup.totalElectricity;
					if (!electricityDeviceWasActive) {
						adjustedElectricityUsage = 1800; 
					}

					// その日の水と電気の合計使用量で総合スコアを計算（デバイス情報を考慮）
					const conservationResult = calculateConservationScore({
						waterUsage: dateGroup.totalWater,
						electricityUsage: adjustedElectricityUsage,
						electricityDeviceLastSeen: electricityDeviceInfo?.lastSeen || null,
						calculationDate: new Date(date + "T00:00:00Z"), // 処理対象日
					});

					// その日の全dailyUsageドキュメントに同じ総合スコアを設定
					for (const doc of dateGroup.docs) {
						batch.update(doc.ref, {
							conservationScore: conservationResult.conservationScore,
							totalDailyWater: dateGroup.totalWater,
							totalDailyElectricity: adjustedElectricityUsage, // 調整された電気使用量を記録
							actualElectricityUsage: dateGroup.totalElectricity, // 実際の測定値も保持
							electricityUsedBaseline: !electricityDeviceWasActive, // 基準値を使用したかどうかのフラグ
							processedAt: admin.firestore.FieldValue.serverTimestamp(),
						});
					}

					totalScoreAdded += conservationResult.conservationScore;
					processedCount += dateGroup.docs.length;
					processedDates.push(date);
				}

				// バッチ実行
				await batch.commit();
			}
		}

		// 現在の水族館データを取得（常に実行）
		const currentAquarium = aquariumDoc.exists
			? aquariumDoc.data()
			: { conservationMeter: 50, enviromentLevel: 0 };

		const currentConservationMeter = currentAquarium?.conservationMeter || 50;
		const currentEnvironmentLevel = currentAquarium?.enviromentLevel || 0;

		// 新しい節約メーター値を計算（スコア加算は初回ログイン時のみ）
		let newConservationMeter = currentConservationMeter;
		if (isFirstLoginToday && totalScoreAdded !== 0) {
			newConservationMeter = currentConservationMeter + totalScoreAdded;
		}

		// 環境レベルと関連変数を初期化（常に実行）
		let newEnvironmentLevel = currentEnvironmentLevel;
		let environmentChanged = false;
		const meterResets: Array<{
			resetTo: number;
			reason: string;
			message: string;
		}> = [];
		let fedFishCount = 0;
		let newEggCount = 0;

		// 自動餌やりロジック（conservationMeter ≥ 100で実行）
		if (newConservationMeter >= 100) {
			// 魚のデータを取得
			const fishSnapshot = await aquariumRef.collection("fish").get();

			for (const fishDoc of fishSnapshot.docs) {
				const fishData = fishDoc.data();
				const currentEggMeter = fishData.eggMeter || 0;
				const currentGrowthLevel = fishData.growthLevel || 1;
				let newEggMeter = Math.min(3, currentEggMeter + 1); // 最大3
				const newGrowthLevel = Math.min(10, currentGrowthLevel + 1); // 最大10

				// 卵メーターが3に達した場合、卵を生成してリセット
				if (newEggMeter === 3 && currentEggMeter < 3) {
					newEggCount++;
					newEggMeter = 0; // 卵メーターをリセット
				}

				// 魚のeggMeterを更新
				await fishDoc.ref.update({
					eggMeter: newEggMeter,
					growthLevel: newGrowthLevel,
					lastFed: admin.firestore.FieldValue.serverTimestamp(),
				});

				fedFishCount++;
			}
		}

		while (newConservationMeter <= 0 || newConservationMeter >= 100) {
			if (newConservationMeter <= 0) {
				// 環境レベルを-5し、メーターを50にリセット（0以下の部分は無視）
				newEnvironmentLevel = Math.max(0, newEnvironmentLevel - 5);
				newConservationMeter = 50;
				environmentChanged = true;
				meterResets.push({
					resetTo: newConservationMeter,
					reason: "zero",
					message:
						"節約メーターがゼロを下回ったため、環境レベルが低下し、メーターが50にリセットされました",
				});
			} else if (newConservationMeter >= 100) {
				// 環境レベルを+5し、残りの値を保持（50にリセットしない）
				newEnvironmentLevel = newEnvironmentLevel + 5;
				newConservationMeter = newConservationMeter - 100;
				environmentChanged = true;
				meterResets.push({
					resetTo: newConservationMeter,
					reason: "hundred",
					message: "節約メーターが100に達したため、環境レベルが向上しました！",
				});
			}

			// 無限ループ防止
			if (meterResets.length > 10) {
				break;
			}
		}
		// 最終的にメーターを0-100の範囲に制限
		newConservationMeter = Math.max(0, Math.min(100, newConservationMeter));

		// 水族館データを更新（変更があった場合のみ、または強制実行の場合）
		const shouldUpdate =
			(isFirstLoginToday && totalScoreAdded !== 0) ||
			environmentChanged ||
			fedFishCount > 0 ||
			forceProcess;

		if (shouldUpdate) {
			const updateData: {
				conservationMeter: number;
				lastUpdated: admin.firestore.FieldValue;
				enviromentLevel?: number;
				unhatchedEggCount?: number;
				lastFeedingDate?: string;
			} = {
				conservationMeter: newConservationMeter,
				lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
			};

			if (environmentChanged) {
				updateData.enviromentLevel = newEnvironmentLevel;
			}

			// 餌やりを実行した場合、たまご数と餌やり日付を更新
			if (fedFishCount > 0) {
				const currentUnhatchedEggCount =
					currentAquarium?.unhatchedEggCount || 0;
				updateData.unhatchedEggCount = currentUnhatchedEggCount + newEggCount;
				updateData.lastFeedingDate = todayString;
			}

			await aquariumRef.update(updateData);
		}

		// ユーザーのlastLoginを今日の日付に更新（エラーハンドリングと詳細ログを追加）
		try {
			console.log(`=== ユーザー情報更新処理開始 ===`);
			console.log(`userId: ${userId}`);
			console.log(`todayString: ${todayString}`);
			console.log(`前回のlastLogin: ${lastLogin}`);
			console.log(`isFirstLoginToday: ${isFirstLoginToday}`);
			
			const userUpdateData = {
				lastLogin: todayString,
				lastLoginTime: admin.firestore.FieldValue.serverTimestamp(),
			};
			
			console.log(`更新データ:`, userUpdateData);
			
			await userRef.set(userUpdateData, { merge: true });
			
			console.log(`✅ ユーザー情報更新成功`);
			
			// 更新後のデータを確認
			const updatedUserDoc = await userRef.get();
			if (updatedUserDoc.exists) {
				const updatedData = updatedUserDoc.data()!;
				console.log(`更新後のlastLogin: ${updatedData.lastLogin}`);
				console.log(`更新後のlastLoginTime:`, updatedData.lastLoginTime);
			}
		} catch (userUpdateError) {
			console.error(`❌ ユーザー情報更新エラー:`, userUpdateError);
			// ユーザー情報更新が失敗してもAPIレスポンスは成功とする（水族館データの処理は完了しているため）
		}

		// レスポンスデータを構築
		const responseData = {
			message: forceProcess
				? `[デバッグ] 強制実行により使用量データを処理しました`
				: isFirstLoginToday
				? `今日初回ログインのため、過去の使用量データを処理しました`
				: "本日は既にログイン済みです",
			isFirstLoginToday: forceProcess ? true : isFirstLoginToday,
			processedCount,
			processedDates,
			totalScoreAdded: isFirstLoginToday ? totalScoreAdded : 0,
			aquariumUpdated: isFirstLoginToday && totalScoreAdded !== 0,
			forceProcessed: forceProcess,
		};

		return NextResponse.json(createSuccessResponse(responseData), {
			status: 200,
		});
	} catch (error) {
		console.error("Daily usage processing error:", error);
		return NextResponse.json(
			createErrorResponse(
				"SERVER_ERROR",
				"dailyUsage処理中にエラーが発生しました",
				500
			),
			{ status: 500 }
		);
	}
}
