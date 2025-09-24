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

	const { unityProvider, isLoaded, loadingProgression, sendMessage } =
		useUnityContext({
			loaderUrl: "Build/build_aquariumotion.loader.js",
			dataUrl: "Build/build_aquariumotion.data",
			frameworkUrl: "Build/build_aquariumotion.framework.js",
			codeUrl: "Build/build_aquariumotion.wasm",
		});

	// コンテナのサイズを監視してUnityキャンバスのサイズを調整
	useEffect(() => {
		const handleResize = () => {
			if (containerRef.current) {
				const rect = containerRef.current.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0) {
					setDimensions({
						width: Math.floor(rect.width),
						height: Math.floor(rect.height),
					});
				}
			}
		};

		// 初期サイズ設定（少し遅延させる）
		const timeoutId = setTimeout(handleResize, 100);

		// リサイズ監視
		const handleWindowResize = () => {
			requestAnimationFrame(handleResize);
		};
		window.addEventListener("resize", handleWindowResize, { passive: true });

		// ResizeObserver for more accurate container size tracking
		let resizeObserver: ResizeObserver | null = null;
		if (typeof ResizeObserver !== 'undefined') {
			try {
				resizeObserver = new ResizeObserver((entries) => {
					// requestAnimationFrameで次のフレームで実行
					requestAnimationFrame(() => {
						for (const entry of entries) {
							if (entry.target === containerRef.current) {
								handleResize();
								break;
							}
						}
					});
				});
				
				// DOM要素が存在する場合のみ監視開始
				if (containerRef.current) {
					resizeObserver.observe(containerRef.current);
				}
			} catch (error) {
				console.warn('ResizeObserver initialization failed:', error);
			}
		}

		return () => {
			clearTimeout(timeoutId);
			window.removeEventListener("resize", handleWindowResize);
			if (resizeObserver) {
				try {
					resizeObserver.disconnect();
				} catch (error) {
					console.warn('ResizeObserver disconnect failed:', error);
				}
			}
		};
	}, []);

	// ロード中の表示
	const loadingPercentage = Math.round(loadingProgression * 100);

	// Unityへのデータ送信を統合（初回ロード時と更新時）
	useEffect(() => {
		if (!isLoaded) return;

		const sendDataToUnity = () => {
			try {
				// 水槽データの送信
				if (aquariumData) {
					const aquariumJson = JSON.stringify({
						enviromentLevel: aquariumData.enviromentLevel,
						conservationMeter: aquariumData.conservationMeter,
						unhatchedEggCount: aquariumData.unhatchedEggCount || 0,
						lastUpdated: safeTimestampToISO(aquariumData.lastUpdated),
					});

					sendMessage("GameManager", "ReceiveAquariumData", aquariumJson);
				}

				// 魚データの送信
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

				console.log("データをUnityに送信しました:", { aquariumData, fishData });
			} catch (error) {
				console.error("Unityへのデータ送信に失敗しました:", error);
			}
		};

		sendDataToUnity();
	}, [isLoaded, aquariumData, fishData, sendMessage]);

	return (
		<div ref={containerRef} className='w-full h-full relative'>
			{!isLoaded && (
				<div className='absolute inset-0 flex items-center justify-center bg-gradient-to-b from-blue-100 to-blue-200 z-10'>
					<div className='text-center'>
						<p className='text-blue-600 font-semibold'>
							Loading... ({loadingPercentage}%)
						</p>
						<div className='text-xs text-blue-500 mt-2'>
							画面サイズ: {dimensions.width} x {dimensions.height}
						</div>
					</div>
				</div>
			)}
			{dimensions.width > 0 && dimensions.height > 0 && (
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
