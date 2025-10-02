import React, { useEffect, useState, useRef } from "react";
import { Unity, useUnityContext } from "react-unity-webgl";
import type { Fish, Aquarium } from "@/types/aquarium";
import type { Timestamp } from "firebase/firestore";





interface UnityComponentProps {
	fishData: Fish[];
	aquariumData: Aquarium | null;
}

function UnityComponent({ fishData, aquariumData }: UnityComponentProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
	const [isComponentMounted, setIsComponentMounted] = useState(false);
	// データ送信のタイミングを制御するためのref
	const lastSentDataRef = useRef<string>('');
	const isInitialSendRef = useRef(false);

	const { unityProvider, isLoaded, loadingProgression, sendMessage } =
		useUnityContext({
			loaderUrl: "Build/build_aquariumotion.loader.js",
			dataUrl: "Build/build_aquariumotion.data",
			frameworkUrl: "Build/build_aquariumotion.framework.js",
			codeUrl: "Build/build_aquariumotion.wasm",
		});

	// コンポーネントのマウント状態を管理
	useEffect(() => {
		setIsComponentMounted(true);
		return () => setIsComponentMounted(false);
	}, []);

	// コンテナのサイズを監視してUnityキャンバスのサイズを調整
	useEffect(() => {
		if (!isComponentMounted) return;

		let timeoutId: NodeJS.Timeout | null = null;
		let resizeObserver: ResizeObserver | null = null;
		let isCleanedUp = false;

		const handleResize = () => {
			if (isCleanedUp || !containerRef.current || !isComponentMounted) return;

			const rect = containerRef.current.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				setDimensions({
					width: Math.floor(rect.width),
					height: Math.floor(rect.height),
				});
			}
		};

		// リサイズ監視
		const handleWindowResize = () => {
			if (isCleanedUp) return;
			requestAnimationFrame(handleResize);
		};

		// イベントリスナーの安全な追加
		try {
			window.addEventListener("resize", handleWindowResize, { passive: true });
		} catch (error) {
			console.warn('Window resize listener registration failed:', error);
		}

		// ResizeObserver for more accurate container size tracking
		if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
			try {
				resizeObserver = new ResizeObserver((entries) => {
					if (isCleanedUp) return;

					// requestAnimationFrameで次のフレームで実行
					requestAnimationFrame(() => {
						if (isCleanedUp) return;

						for (const entry of entries) {
							if (entry.target === containerRef.current) {
								handleResize();
								break;
							}
						}
					});
				});

				resizeObserver.observe(containerRef.current);
			} catch (error) {
				console.warn('ResizeObserver initialization failed:', error);
				resizeObserver = null;
			}
		}

		// 初期サイズ設定（少し遅延させる）
		timeoutId = setTimeout(() => {
			if (!isCleanedUp) {
				handleResize();
			}
		}, 100);

		return () => {
			isCleanedUp = true;

			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			try {
				window.removeEventListener("resize", handleWindowResize);
			} catch (error) {
				console.warn('Window resize listener removal failed:', error);
			}

			if (resizeObserver) {
				try {
					resizeObserver.disconnect();
				} catch (error) {
					console.warn('ResizeObserver disconnect failed:', error);
				}
			}
		};
	}, [isComponentMounted]);

	// ロード中の表示
	const loadingPercentage = Math.round(loadingProgression * 100);

	// Unityへのデータ送信を統合（初回ロード時と更新時）
	useEffect(() => {
		if (!isLoaded || !isComponentMounted || !containerRef.current) return;

		let timeoutId: NodeJS.Timeout | null = null;
		let isSending = false;

		const sendDataToUnity = async () => {
			// 同時送信を防ぐ
			if (isSending) return;
			isSending = true;

			try {
				// データのハッシュ値を生成して重複送信を防ぐ
				const dataHash = JSON.stringify({
					aquarium: aquariumData,
					fish: fishData
				});

				// 同じデータの重複送信を防ぐ
				if (lastSentDataRef.current === dataHash && isInitialSendRef.current) {
					console.log("同じデータのため、Unity送信をスキップしました");
					return;
				}

				// 送信前にデータの有効性をチェック
				if (!aquariumData && fishData.length === 0) {
					console.log("送信可能なデータがありません");
					return;
				}

				// sendMessage が存在することを確認
				if (typeof sendMessage !== 'function') {
					console.warn("sendMessage関数が利用できません");
					return;
				}

				// 水槽データの送信（存在する場合のみ）
				if (aquariumData) {
					const aquariumJson = JSON.stringify({
						enviromentLevel: aquariumData.enviromentLevel,
						conservationMeter: aquariumData.conservationMeter,
						unhatchedEggCount: aquariumData.unhatchedEggCount || 0,
						lastUpdated: safeTimestampToISO(aquariumData.lastUpdated),
					});

					sendMessage("GameManager", "ReceiveAquariumData", aquariumJson);
					// 送信間隔を空ける
					await new Promise(resolve => setTimeout(resolve, 50));
				}

				// 魚データの送信（存在する場合のみ）
				if (fishData.length > 0) {
					const fishJson = JSON.stringify(
						fishData.map((fish) => ({
							id: fish.id,
							type_id: fish.type_id,
							fish_name: fish.fish_name,
							status: fish.status,
							eggMeter: fish.eggMeter,
							growthLevel: fish.growthLevel,
							birthDate: safeTimestampToISO(fish.birthDate),
						}))
					);

					sendMessage("GameManager", "ReceiveFishData", fishJson);
				}

				// 送信完了の記録
				lastSentDataRef.current = dataHash;
				isInitialSendRef.current = true;
				console.log("データをUnityに送信しました:", { aquariumData, fishData });
			} catch (error) {
				console.error("Unityへのデータ送信に失敗しました:", error);
			} finally {
				isSending = false;
			}
		};

		// Unity読み込み完了後に少し遅延をかけてデータ送信
		timeoutId = setTimeout(() => {
			sendDataToUnity();
		}, 200); // 遅延を少し長くして安定性を向上

		return () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		};
	}, [isLoaded, aquariumData, fishData, sendMessage, isComponentMounted]);

	return (
		<div ref={containerRef} className='w-full h-full relative'>
			{!isLoaded && (
				<div className='absolute inset-0 flex items-center justify-center bg-[#66B5D3] z-10'>
					<div className='text-center'>
						<p className='text-cyan-100 font-semibold'>
							Loading... ({loadingPercentage}%)
						</p>
						<div className='text-xs text-cyan-200 mt-2'>
							画面サイズ: {dimensions.width} x {dimensions.height}
						</div>
					</div>
				</div>
			)}
			{isComponentMounted && dimensions.width > 0 && dimensions.height > 0 && containerRef.current && (
				<Unity
					unityProvider={unityProvider}
					style={{
						width: dimensions.width,
						height: dimensions.height,
						visibility: isLoaded ? "visible" : "hidden",
					}}
				/>
			)}
		</div>
	);
}

const safeTimestampToISO = (
	timestamp: Timestamp | undefined | null
): string => {
	if (!timestamp) {
		console.warn("Timestampが未定義です。現在時刻を使用します。");
		return new Date().toISOString();
	}

	if (timestamp && typeof timestamp.toDate === "function") {
		try {
			return timestamp.toDate().toISOString();
		} catch (error) {
			console.error("Timestamp変換エラー:", error);
			return new Date().toISOString();
		}
	}

	console.warn("無効なTimestamp形式です:", timestamp);
	return new Date().toISOString();
};

export default UnityComponent;
