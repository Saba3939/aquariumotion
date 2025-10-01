import { getDB } from './firebase-server';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { DailyUsage, Device, UserDevices } from '../types/firestore';

// 日次使用量データ保存
export async function saveDailyUsage(
  userId: string,
  usageType: 'water' | 'electricity',
  amount: number
): Promise<void> {
  const db = getDB();
  if (!db) {
    throw new Error('Firebase Admin SDK not initialized');
  }
  
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const docId = `${userId}_${today}`;
  const docRef = db.collection('dailyUsage').doc(docId);

  // 加算方式でデータを更新
  const updateData: Partial<DailyUsage> = {
    userId,
    date: today,
    [`${usageType}Usage`]: FieldValue.increment(amount),
    // 測定が成功したことを記録（デバイスが正常に稼働していることを示す）
    [`${usageType}DeviceActive`]: true
  };

  await docRef.set(updateData, { merge: true });
}

// デバイス登録
export async function registerDevice(deviceType: 'electricity' | 'water'): Promise<Device> {
  const db = getDB();
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
  const db = getDB();
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

// ユーザーのデバイス情報を取得
export async function getUserDevices(userId: string): Promise<UserDevices | null> {
  const db = getDB();
  if (!db) {
    throw new Error('Firebase Admin SDK not initialized');
  }
  
  const userDevicesDoc = await db.collection('userDevices').doc(userId).get();
  
  if (!userDevicesDoc.exists) {
    return null;
  }
  
  const data = userDevicesDoc.data() as UserDevices;
  return {
    electricityDeviceId: data.electricityDeviceId,
    waterDeviceId: data.waterDeviceId,
    lastUpdated: data.lastUpdated
  };
}

// 複数デバイスの詳細情報を取得
export async function getDeviceDetails(deviceIds: string[], userId: string): Promise<Device[]> {
  const db = getDB();
  if (!db) {
    throw new Error('Firebase Admin SDK not initialized');
  }
  
  if (deviceIds.length === 0) {
    return [];
  }
  
  // ユーザーに紐付いているデバイスのみ取得
  const devicesSnapshot = await db.collection('devices')
    .where('userId', '==', userId)
    .where('deviceId', 'in', deviceIds)
    .get();
  
  const devices: Device[] = [];
  devicesSnapshot.forEach(doc => {
    const data = doc.data();
    devices.push({
      deviceId: data.deviceId,
      deviceType: data.deviceType,
      registrationCode: data.registrationCode,
      isActive: data.isActive,
      lastSeen: data.lastSeen?.toDate ? data.lastSeen.toDate() : new Date(data.lastSeen),
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt)
    });
  });
  
  return devices;
}

// ユーザーからデバイスの紐付けを解除
export async function unlinkDeviceFromUser(userId: string, deviceId: string): Promise<boolean> {
  const db = getDB();
  if (!db) {
    throw new Error('Firebase Admin SDK not initialized');
  }
  
  try {
    // デバイスの所有者確認
    const deviceDoc = await db.collection('devices').doc(deviceId).get();
    if (!deviceDoc.exists || deviceDoc.data()?.userId !== userId) {
      return false;
    }
    
    const device = deviceDoc.data() as Device;
    
    // デバイスから紐付けを解除
    await deviceDoc.ref.update({
      userId: null,
      isActive: false,
      lastSeen: Timestamp.now()
    });
    
    // ユーザーデバイス情報から削除
    const userDevicesRef = db.collection('userDevices').doc(userId);
    const userDevicesDoc = await userDevicesRef.get();
    
    if (userDevicesDoc.exists) {
      const updateData: Record<string, string | null | Timestamp> = {
        lastUpdated: Timestamp.now()
      };
      
      // デバイスタイプに応じて該当フィールドをnullに設定
      if (device.deviceType === 'electricity') {
        updateData.electricityDeviceId = null;
      } else if (device.deviceType === 'water') {
        updateData.waterDeviceId = null;
      }
      
      await userDevicesRef.update(updateData);
    }
    
    return true;
  } catch (error) {
    console.error('Error unlinking device:', error);
    return false;
  }
}

// デバイス検証（API-KEY認証用）
export async function verifyDevice(deviceId: string): Promise<Device | null> {
  const db = getDB();
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