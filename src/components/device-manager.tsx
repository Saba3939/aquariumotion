'use client';

import { useState, useEffect, useCallback } from 'react';
import { getFirebaseAuth } from '@/lib/firebase';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { Button } from '@/components/ui/button';

interface Device {
  deviceId: string;
  deviceType: 'electricity' | 'water';
  isActive: boolean;
  lastSeen: Date;
  createdAt: Date;
  registrationCode?: string;
}

interface UserDevices {
  electricityDeviceId?: string;
  waterDeviceId?: string;
  lastUpdated: Date;
}

export default function DeviceManager() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [registrationCode, setRegistrationCode] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [userDevices, setUserDevices] = useState<UserDevices | null>(null);
  const [linkedDevices, setLinkedDevices] = useState<Device[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState('link');

  // ユーザーのデバイス情報を取得
  const fetchUserDevices = useCallback(async () => {
    if (!user) return;

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/user-devices', {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUserDevices(data.success ? data.data : null);
      }
    } catch {
      console.error('デバイス情報の取得に失敗');
      setUserDevices(null);
    }
  }, [user]);

  // 紐付け済みデバイスの詳細情報を取得
  const fetchDeviceDetails = useCallback(async (deviceIds: string[]) => {
    if (!user || deviceIds.length === 0) return;

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/device-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ deviceIds }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Timestamp を Date に変換
          const devices = data.data.map((device: Record<string, unknown>) => ({
            ...device,
            lastSeen: (device.lastSeen as { seconds?: number })?.seconds 
              ? new Date((device.lastSeen as { seconds: number }).seconds * 1000) 
              : new Date(device.lastSeen as string | number),
            createdAt: (device.createdAt as { seconds?: number })?.seconds 
              ? new Date((device.createdAt as { seconds: number }).seconds * 1000) 
              : new Date(device.createdAt as string | number)
          })) as Device[];
          setLinkedDevices(devices);
        } else {
          setLinkedDevices([]);
        }
      }
    } catch {
      console.error('デバイス詳細の取得に失敗');
      setLinkedDevices([]);
    }
  }, [user]);

  // デバイス紐付け
  const handleLinkDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !registrationCode.trim()) return;

    setIsLinking(true);
    setMessage(null);

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/link-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ registrationCode: registrationCode.trim().toUpperCase() }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: 'デバイスが正常に登録されました！' });
        setRegistrationCode('');
        setActiveTab('manage');
        await fetchUserDevices();
      } else {
        setMessage({ type: 'error', text: data.message || 'デバイスの登録に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: 'ネットワークエラーが発生しました' });
    } finally {
      setIsLinking(false);
    }
  };

  // デバイス解除
  const handleUnlinkDevice = async (deviceId: string) => {
    if (!user || !confirm('このデバイスの登録を解除しますか？')) return;

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/unlink-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ deviceId }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: 'デバイスの登録を解除しました' });
        await fetchUserDevices();
      } else {
        setMessage({ type: 'error', text: 'デバイスの解除に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: 'ネットワークエラーが発生しました' });
    }
  };

  // 認証状態の監視
  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    
    return () => unsubscribe();
  }, []);

  // 初期データ取得
  useEffect(() => {
    fetchUserDevices();
  }, [user, fetchUserDevices]);

  // デバイス詳細取得
  useEffect(() => {
    if (userDevices) {
      const deviceIds = [
        userDevices.electricityDeviceId,
        userDevices.waterDeviceId,
      ].filter(Boolean) as string[];
      fetchDeviceDetails(deviceIds);
    }
  }, [userDevices, fetchDeviceDetails]);

  if (!user) {
    return (
      <div className="bg-white border rounded-lg p-6">
        <p className="text-center text-gray-600">
          デバイス連携を利用するにはログインが必要です
        </p>
      </div>
    );
  }

  const getDeviceTypeLabel = (type: 'electricity' | 'water') => {
    return type === 'electricity' ? '電気使用量センサー' : '水道使用量センサー';
  };

  const getDeviceStatusBadge = (device: Device) => {
    const lastSeenTime = device.lastSeen instanceof Date 
      ? device.lastSeen.getTime() 
      : new Date(device.lastSeen).getTime();
    const lastSeenHours = (Date.now() - lastSeenTime) / (1000 * 60 * 60);
    
    if (lastSeenHours < 1) {
      return <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">オンライン</span>;
    } else if (lastSeenHours < 24) {
      return <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">最近</span>;
    } else {
      return <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">オフライン</span>;
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-3 rounded border ${
          message.type === 'success' 
            ? 'border-green-200 bg-green-50 text-green-700' 
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('link')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'link'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            デバイス登録
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'manage'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            デバイス管理
          </button>
        </nav>
      </div>

      {activeTab === 'link' && (
        <div className="bg-white border rounded-lg p-6">
          <h3 className="text-lg font-medium mb-4">新しいデバイスを登録</h3>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="registrationCode" className="block text-sm font-medium text-gray-700">
                登録コード
              </label>
              <input
                id="registrationCode"
                type="text"
                placeholder="デバイス記載のコードを入力してください"
                value={registrationCode}
                onChange={(e) => setRegistrationCode(e.target.value.toUpperCase())}
                maxLength={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono"
              />
              <p className="text-sm text-gray-600">
                節電デバイスに記載されたコードを入力してください
              </p>
            </div>

            <form onSubmit={handleLinkDevice}>
              <Button type="submit" disabled={isLinking || !registrationCode.trim()}>
                {isLinking ? '登録中...' : 'デバイスを登録'}
              </Button>
            </form>

            <hr className="my-6" />

            <div className="space-y-2">
              <h4 className="font-medium">登録手順</h4>
              <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                <li>ESP32デバイスの電源を入れてWiFiに接続します</li>
                <li>デバイスに記載された8桁のコードを確認します</li>
                <li>上記の入力欄にコードを入力して「デバイスを登録」ボタンをクリックします</li>
                <li>登録が完了すると、デバイスからのデータ送信が開始されます</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'manage' && (
        <div className="bg-white border rounded-lg p-6">
          <h3 className="text-lg font-medium mb-4">登録済みデバイス</h3>
          
          {linkedDevices.length === 0 ? (
            <p className="text-center text-gray-600 py-8">
              登録されたデバイスはありません
            </p>
          ) : (
            <div className="space-y-4">
              {linkedDevices.map((device) => (
                <div
                  key={device.deviceId}
                  className="border rounded-lg p-4 space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h4 className="font-medium">{getDeviceTypeLabel(device.deviceType)}</h4>
                      <p className="text-sm text-gray-600">
                        デバイスID: {device.deviceId}
                      </p>
                    </div>
                    {getDeviceStatusBadge(device)}
                  </div>

                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="font-medium">登録日:</span>{' '}
                      {(device.createdAt instanceof Date 
                        ? device.createdAt 
                        : new Date(device.createdAt)
                      ).toLocaleDateString('ja-JP')}
                    </p>
                    <p>
                      <span className="font-medium">最終接続:</span>{' '}
                      {(device.lastSeen instanceof Date 
                        ? device.lastSeen 
                        : new Date(device.lastSeen)
                      ).toLocaleString('ja-JP')}
                    </p>
                  </div>

                  <Button
                    onClick={() => handleUnlinkDevice(device.deviceId)}
                    className="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1"
                  >
                    デバイス解除
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
