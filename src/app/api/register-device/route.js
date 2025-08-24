// Firebase Admin SDK (ESモジュール対応)
import admin from 'firebase-admin';

// Firebase Admin初期化
function initializeFirebase() {
  try {
    if (!admin.apps.length) {
      const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT;
      
      if (!serviceAccountJson) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT environment variable is not set');
      }
      
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    return admin.firestore();
  } catch (error) {
    console.error('Firebase initialization error:', error);
    throw error;
  }
}

// MACアドレスの正規化
function normalizeMacAddress(mac) {
  // AA:BB:CC:DD:EE:FF 形式に統一
  return mac.toUpperCase().replace(/[^A-F0-9]/g, '').match(/.{2}/g).join(':');
}

// デバイスタイプの検証
const VALID_DEVICE_TYPES = ['shower', 'room', 'common', 'laundry'];

export async function POST(request) {
  try {
    const body = await request.json();
    console.log('Device registration request:', { method: 'POST', body });
    
    // Firebase初期化
    const db = initializeFirebase();
    
    return await registerDevice(request, db, body);
  } catch (error) {
    console.error('デバイス管理API エラー:', error);
    return Response.json({ 
      error: '内部サーバーエラー',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const query = Object.fromEntries(url.searchParams);
    
    // Firebase初期化
    const db = initializeFirebase();
    
    return await getDevices(request, db, query);
  } catch (error) {
    console.error('デバイス管理API エラー:', error);
    return Response.json({ 
      error: '内部サーバーエラー',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}

// デバイス登録処理
async function registerDevice(request, db, body) {
  // APIキー認証（Webアプリからの呼び出し用）
  const apiKey = request.headers.get('x-api-key');
  const secretKey = process.env.API_SECRET_KEY;

  if (!secretKey) {
    console.error('API_SECRET_KEY environment variable not set');
    return Response.json({ error: '内部サーバーエラー' }, { status: 500 });
  }

  if (!apiKey || apiKey !== secretKey) {
    return Response.json({ error: '認証に失敗しました' }, { status: 401 });
  }

  // リクエストボディの検証
  const { deviceId, deviceName, deviceType, location, ownerId, sensorTypes } = body;

  if (!deviceId || typeof deviceId !== 'string') {
    return Response.json({ error: 'deviceId（MACアドレス）が必要です' }, { status: 400 });
  }

  if (!deviceName || typeof deviceName !== 'string') {
    return Response.json({ error: 'deviceNameが必要です' }, { status: 400 });
  }

  if (!deviceType || !VALID_DEVICE_TYPES.includes(deviceType)) {
    return Response.json({ 
      error: `deviceTypeは ${VALID_DEVICE_TYPES.join(', ')} のいずれかである必要があります` 
    }, { status: 400 });
  }

  if (!location || typeof location !== 'string') {
    return Response.json({ error: 'location（設置場所）が必要です' }, { status: 400 });
  }

  if (!ownerId || typeof ownerId !== 'string') {
    return Response.json({ error: 'ownerId（登録ユーザーID）が必要です' }, { status: 400 });
  }

  try {
    // MACアドレスの正規化
    const normalizedDeviceId = normalizeMacAddress(deviceId);
    console.log('Normalized device ID:', normalizedDeviceId);
    
    // デバイス登録をトランザクションで実行
    const result = await db.runTransaction(async (transaction) => {
      const deviceRef = db.collection('devices').doc(normalizedDeviceId);
      const deviceUserRef = db.collection('deviceUsers').doc(`${normalizedDeviceId}_${ownerId}`);
      
      // デバイスが既に登録されているかチェック
      const existingDevice = await transaction.get(deviceRef);
      if (existingDevice.exists) {
        throw new Error('このデバイスは既に登録されています');
      }
      
      const now = admin.firestore.Timestamp.now();
      
      // デバイス情報を登録
      const deviceData = {
        deviceId: normalizedDeviceId,
        deviceName,
        deviceType,
        location,
        ownerId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: null,
        settings: {
          sensorTypes: sensorTypes || ['water', 'electricity'],
          calibration: {
            waterMultiplier: 1.0,
            electricityMultiplier: 1.0
          }
        }
      };
      
      transaction.set(deviceRef, deviceData);
      
      // デバイス-ユーザー紐付けを登録
      const deviceUserData = {
        deviceId: normalizedDeviceId,
        userId: ownerId,
        role: 'owner',
        permissions: ['read', 'write', 'delete', 'manage'],
        nickname: deviceName,
        createdAt: now,
        isActive: true
      };
      
      transaction.set(deviceUserRef, deviceUserData);
      
      return { deviceData, deviceUserData };
    });

    console.log('Device registration completed successfully');

    // 成功レスポンス
    return Response.json({
      message: 'デバイスが正常に登録されました',
      data: {
        device: {
          deviceId: result.deviceData.deviceId,
          deviceName: result.deviceData.deviceName,
          deviceType: result.deviceData.deviceType,
          location: result.deviceData.location,
          ownerId: result.deviceData.ownerId,
          isActive: result.deviceData.isActive,
          createdAt: result.deviceData.createdAt.toDate(),
          settings: result.deviceData.settings
        },
        deviceUser: {
          role: result.deviceUserData.role,
          permissions: result.deviceUserData.permissions,
          nickname: result.deviceUserData.nickname
        }
      }
    }, { status: 201 });
    
  } catch (error) {
    if (error.message.includes('既に登録されています')) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

// デバイス一覧取得処理
async function getDevices(request, db, query) {
  // クエリパラメータからuserIdを取得
  const { userId } = query;
  
  if (!userId) {
    return Response.json({ error: 'userIdクエリパラメータが必要です' }, { status: 400 });
  }
  
  try {
    // ユーザーに紐付けられたデバイス一覧を取得
    const deviceUsersSnapshot = await db.collection('deviceUsers')
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .get();
    
    if (deviceUsersSnapshot.empty) {
      return Response.json({
        message: '登録されたデバイスはありません',
        data: {
          devices: []
        }
      });
    }
    
    // デバイス詳細情報を取得
    const deviceIds = deviceUsersSnapshot.docs.map(doc => doc.data().deviceId);
    const devicePromises = deviceIds.map(deviceId => 
      db.collection('devices').doc(deviceId).get()
    );
    
    const deviceDocs = await Promise.all(devicePromises);
    const devices = [];
    
    deviceUsersSnapshot.docs.forEach((deviceUserDoc, index) => {
      const deviceUserData = deviceUserDoc.data();
      const deviceDoc = deviceDocs[index];
      
      if (deviceDoc.exists) {
        const deviceData = deviceDoc.data();
        devices.push({
          deviceId: deviceData.deviceId,
          deviceName: deviceData.deviceName,
          deviceType: deviceData.deviceType,
          location: deviceData.location,
          isActive: deviceData.isActive,
          lastSeenAt: deviceData.lastSeenAt?.toDate() || null,
          userRole: deviceUserData.role,
          userPermissions: deviceUserData.permissions,
          userNickname: deviceUserData.nickname,
          createdAt: deviceData.createdAt.toDate()
        });
      }
    });
    
    // 作成日時でソート（新しい順）
    devices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return Response.json({
      message: 'デバイス一覧を取得しました',
      data: {
        devices,
        count: devices.length
      }
    });
    
  } catch (error) {
    console.error('デバイス一覧取得エラー:', error);
    throw error;
  }
}