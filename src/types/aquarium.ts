import { Timestamp } from "firebase/firestore";

// Firestore データ型定義
export interface FirestoreFish {
	id: string;
	type_id: number;
	fish_name: string;
	status: string;
	eggMeter: number;
	growthLevel: number;
	birthDate: Timestamp;
}

export interface FirestoreAquarium {
	enviromentLevel: number;
	conservationMeter: number;
	lastUpdated: Timestamp;
	unhatchedEggCount?: number; // たまごの孵化システム用（オプション）
}

// React用のDate型定義
export interface Fish {
	id: string;
	type_id: number;
	fish_name: string;
	status: string;
	eggMeter: number;
	growthLevel: number;
	birthDate: Timestamp;
}

export interface Aquarium {
	enviromentLevel: number;
	conservationMeter: number;
	lastUpdated: Timestamp;
	unhatchedEggCount: number; // たまごの孵化システム用
}