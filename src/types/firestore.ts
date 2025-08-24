import { Timestamp } from 'firebase-admin/firestore';

// 水族館データ
export interface Aquarium {
  unhatchedEggCount: number;     // 未開封のたまごの数
  conservationMeter: number;     // 節約メーター値
  environmentLevel: number;      // 環境レベル (0-100)
  lastUpdated: Timestamp;        // 最終更新日時
}

// 魚データ
export interface Fish {
  type_id: string;              // 魚の種類ID
  fish_name: string;            // 魚の名前
  status: 'raising' | 'inLinkAquarium';  // 飼育状態
  eggMeter: number;             // たまごメーター (0-3)
  growthLevel: number;          // 成長レベル
  birthDate: Timestamp;         // 生年月日
}

// 日次使用量データ
export interface DailyUsage {
  userId: string;
  date: string;                 // YYYY-MM-DD形式
  waterUsage?: number;
  electricityUsage?: number;
  conservationScore?: number;   // 計算された節約スコア
}

// デバイス情報
export interface Device {
  deviceId: string;           // デバイス一意ID
  deviceType: 'electricity' | 'water';  // デバイス種類
  userId?: string;            // 紐付けユーザー（未登録時はnull）
  registrationCode: string;   // 登録用PINコード
  isActive: boolean;          // 有効フラグ
  lastSeen: Timestamp;        // 最終接続日時
  createdAt: Timestamp;       // 登録日時
}

// ユーザーデバイス管理
export interface UserDevices {
  electricityDeviceId?: string;
  waterDeviceId?: string;
  lastUpdated: Timestamp;
}