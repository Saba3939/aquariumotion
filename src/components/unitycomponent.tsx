import type { Timestamp } from "firebase/firestore";
import React, { useEffect, useState, useRef } from "react";
import { Unity, useUnityContext } from "react-unity-webgl";

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

		// 初期サイズ設定
		handleResize();

		// リサイズ監視
		window.addEventListener("resize", handleResize);

		// ResizeObserver for more accurate container size tracking
		const resizeObserver = new ResizeObserver(handleResize);
		if (containerRef.current) {
			resizeObserver.observe(containerRef.current);
		}

		return () => {
			window.removeEventListener("resize", handleResize);
			resizeObserver.disconnect();
		};
	}, []);

	// ロード中の表示
	const loadingPercentage = Math.round(loadingProgression * 100);

	// Unityがロードされた時にデータを送信
	useEffect(() => {
		if (isLoaded && aquariumData && fishData.length > 0) {
			try {
				// 水槽データをUnityに送信
				const aquariumJson = JSON.stringify({
					enviromentLevel: aquariumData.enviromentLevel,
					conservationMeter: aquariumData.conservationMeter,
					unhatchedEggCount: aquariumData.unhatchedEggCount || 0, // たまごの数を追加
					lastUpdated: safeTimestampToISO(aquariumData.lastUpdated), // 安全な変換
				});

				// 魚データをUnityに送信
				const fishJson = JSON.stringify(
					fishData.map((fish) => ({
						id: fish.id,
						type_id: fish.type_id,
						fish_name: fish.fish_name,
						status: fish.status,
						eggMeter: fish.eggMeter,
						growthLevel: fish.growthLevel,
						birthDate: safeTimestampToISO(fish.birthDate), // 安全な変換
					}))
				);

				// GameObjectName と MethodName は Unity側で設定したものに合わせて変更してください
				sendMessage("GameManager", "ReceiveAquariumData", aquariumJson);
				sendMessage("GameManager", "ReceiveFishData", fishJson);
				console.log("データをUnityに送信しました:", { aquariumData, fishData });
			} catch (error) {
				console.error("Unityへのデータ送信に失敗しました:", error);
			}
		}
	}, [isLoaded, aquariumData, fishData, sendMessage]);

	// データが更新された時にもUnityに送信
	useEffect(() => {
		if (isLoaded && aquariumData) {
			try {
				const aquariumJson = JSON.stringify({
					enviromentLevel: aquariumData.enviromentLevel,
					conservationMeter: aquariumData.conservationMeter,
					unhatchedEggCount: aquariumData.unhatchedEggCount || 0, // たまごの数を追加
					lastUpdated: safeTimestampToISO(aquariumData.lastUpdated), // 安全な変換
				});

				sendMessage("GameManager", "UpdateAquariumData", aquariumJson);
			} catch (error) {
				console.error("水槽データの更新送信に失敗しました:", error);
			}
		}
	}, [aquariumData, isLoaded, sendMessage]);

	useEffect(() => {
		if (isLoaded && fishData.length > 0) {
			try {
				const fishJson = JSON.stringify(
					fishData.map((fish) => ({
						id: fish.id,
						type_id: fish.type_id,
						fish_name: fish.fish_name,
						status: fish.status,
						eggMeter: fish.eggMeter,
						growthLevel: fish.growthLevel,
						birthDate: safeTimestampToISO(fish.birthDate), // 安全な変換
					}))
				);

				sendMessage("GameManager", "UpdateFishData", fishJson);
			} catch (error) {
				console.error("魚データの更新送信に失敗しました:", error);
			}
		}
	}, [fishData, isLoaded, sendMessage]);

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
