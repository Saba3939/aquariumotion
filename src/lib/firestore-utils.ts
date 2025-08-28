import { db } from './firebase-server';
import { Timestamp } from 'firebase-admin/firestore';
import { DailyUsage, Device, UserDevices } from '../types/firestore';

// 日次使用量データ保存
export async function saveDailyUsage(
  userId: string,
  usageType: 'water' | 'electricity',
  amount: number
): Promise<void> {
  if (!db) {
    throw new Error('Firebase Admin SDK not initialized');
  }
  
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const docId = `${userId}_${today}`;
  const docRef = db.collection('dailyUsage').doc(docId);

  const updateData: Partial<DailyUsage> = {
    userId,
    date: today,
    [`${usageType}Usage`]: amount
  };

  await docRef.set(updateData, { merge: true });
}

// デバイス登録
export async function registerDevice(deviceType: 'electricity' | 'water'): Promise<Device> {
  if (!db) {
    throw new Error('Firebase Admin SDK not initialized');
  }
  
  const deviceId = `${deviceType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const registrationCode = Math.random().toString(36).substr(2, 8).toUpperCase();
  
  const device: Device = {
    deviceId,
    deviceType,
    registrationCode,
    isActive: false,
    lastSeen: Timestamp.now(),
    createdAt: Timestamp.now()
  };

  await db.collection('devices').doc(deviceId).set(device);
  return device;
}

// デバイス紐付け
export async function linkDeviceToUser(userId: string, registrationCode: string): Promise<boolean> {
  if (!db) {
    throw new Error('Firebase Admin SDK not initialized');
  }
  
  // 登録コードでデバイスを検索
  const devicesSnapshot = await db.collection('devices')
    .where('registrationCode', '==', registrationCode)
    .where('isActive', '==', false)
    .limit(1)
    .get();

  if (devicesSnapshot.empty) {
    return false;
  }

  const deviceDoc = devicesSnapshot.docs[0];
  const device = deviceDoc.data() as Device;

  // デバイスをユーザーに紐付け
  await deviceDoc.ref.update({
    userId,
    isActive: true,
    lastSeen: Timestamp.now()
  });

  // ユーザーデバイス情報更新
  const userDevicesRef = db.collection('userDevices').doc(userId);
  const updateData: Partial<UserDevices> = {
    [`${device.deviceType}DeviceId`]: device.deviceId,
    lastUpdated: Timestamp.now()
  };

  await userDevicesRef.set(updateData, { merge: true });
  return true;
}

// デバイス検証（API-KEY認証用）
export async function verifyDevice(deviceId: string): Promise<Device | null> {
  if (!db) {
    throw new Error('Firebase Admin SDK not initialized');
  }
  
  const deviceDoc = await db.collection('devices').doc(deviceId).get();
  
  if (!deviceDoc.exists) {
    return null;
  }

  const device = deviceDoc.data() as Device;
  
  // 最終接続時刻を更新
  await deviceDoc.ref.update({
    lastSeen: Timestamp.now()
  });

  return device;
}