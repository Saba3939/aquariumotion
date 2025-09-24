'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';

interface SimulatedDevice {
  deviceId: string;
  deviceType: 'electricity' | 'water';
  registrationCode: string;
  isRegistered: boolean;
}

export default function ESP32SimulatorPage() {
  const [devices, setDevices] = useState<SimulatedDevice[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<SimulatedDevice | null>(null);
  const [dataSendingInterval, setDataSendingInterval] = useState<NodeJS.Timeout | null>(null);
  const [lastDataSent, setLastDataSent] = useState<Date | null>(null);
  const [totalDataSent, setTotalDataSent] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [connectionStartTime, setConnectionStartTime] = useState<Date | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString('ja-JP');
    const logEntry = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev, logEntry]);
    
    setTimeout(() => {
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      }
    }, 100);
  }, []);

  const clearLogs = () => {
    setLogs([]);
  };

  const addTestLog = () => {
    addLog('🔧 テストログメッセージです');
  };

  const createSimulatedDevice = (deviceType: 'electricity' | 'water') => {
    const deviceId = `${deviceType}_sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newDevice: SimulatedDevice = {
      deviceId,
      deviceType,
      isRegistered: false,
      registrationCode: '',
    };

    setDevices(prev => [...prev, newDevice]);
    addLog(`🔨 ${deviceType === 'electricity' ? '電気使用量センサー' : '水道使用量センサー'}デバイスを作成: ${deviceId}`);
    
    return newDevice;
  };

  const registerDevice = async (device: SimulatedDevice) => {
    addLog(`📝 デバイス ${device.deviceId} をサーバーに登録中...`);
    
    try {
      const response = await fetch('/api/register-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceType: device.deviceType,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const newDeviceId = data.data.deviceId;
          const registrationCode = data.data.registrationCode;
          
          // サーバーで生成された実際のデバイスIDに更新
          setDevices(prev => prev.map(d => 
            d.deviceId === device.deviceId 
              ? { 
                  ...d, 
                  deviceId: newDeviceId,  // 実際のデバイスIDに更新
                  registrationCode 
                }
              : d
          ));
          
          addLog(`✅ 登録成功! 新デバイスID: ${newDeviceId}`);
          addLog(`🔑 登録コード: ${registrationCode}`);
          addLog(`📱 このコードをWebサイトで入力してください`);
        } else {
          addLog(`❌ 登録失敗: ${data.message}`);
        }
      } else {
        addLog(`❌ サーバーエラー: ${response.status}`);
      }
    } catch (error) {
      addLog(`❌ 通信エラー: ${error}`);
    }
  };;

  const checkDeviceStatus = async (device: SimulatedDevice) => {
    addLog(`🔍 デバイス ${device.deviceId} の登録状態確認中...`);
    
    try {
      const response = await fetch('/api/check-device-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deviceId: device.deviceId }),
      });

      if (response.ok) {
        const data = await response.json();
        addLog(`📊 API レスポンス: ${JSON.stringify(data.data)}`);
        
        if (data.success && data.data.isActive) {
          addLog(`✅ デバイス ${device.deviceId} がアクティブ状態です`);
          
          // 現在の登録状態を確認
          const currentDevices = devices;
          const currentDevice = currentDevices.find(d => d.deviceId === device.deviceId);
          const wasNotRegistered = !currentDevice?.isRegistered;
          
          // デバイス状態を更新
          setDevices(prev => prev.map(d => 
            d.deviceId === device.deviceId 
              ? { ...d, isRegistered: true }
              : d
          ));
          
          // 初回登録の場合のみデータ送信モードを開始
          if (wasNotRegistered) {
            addLog(`🎉 デバイス ${device.deviceId} を登録済みに更新`);
            addLog(`🚀 データ送信モードを開始します`);
            
            // 更新されたデバイス情報でデータ送信開始
            const registeredDevice = { ...device, isRegistered: true };
            setTimeout(() => {
              startDataSendingMode(registeredDevice);
            }, 100);
          }
          
          addLog(`✅ デバイス ${device.deviceId} がユーザーに紐付けられました`);
          return true;
        } else {
          addLog(`⏳ デバイス ${device.deviceId} はまだ登録されていません`);
        }
      } else {
        addLog(`❌ API エラー: ${response.status}`);
      }
    } catch (error) {
      addLog(`❌ 状態確認エラー: ${error}`);
      setFailedAttempts(prev => prev + 1);
    }
    return false;
  };;;;

  const simulateDataSending = async (device: SimulatedDevice) => {
    addLog(`🔄 データ送信処理開始 - デバイス: ${device.deviceId}`);
    
    // 最新のデバイス状態を取得（重要：古いデバイス参照ではなく最新状態を確認）
    const currentDevices = devices;
    const currentDevice = currentDevices.find(d => d.deviceId === device.deviceId);
    
    addLog(`📋 引数のデバイス登録状態: ${device.isRegistered ? '登録済み' : '未登録'}`);
    addLog(`📋 最新のデバイス登録状態: ${currentDevice?.isRegistered ? '登録済み' : '未登録'}`);
    
    // 最新の状態をチェック - どちらかが登録済みなら送信実行
    const isRegisteredNow = device.isRegistered || currentDevice?.isRegistered;
    
    if (!isRegisteredNow) {
      addLog('⚠️ デバイスが未登録のためデータ送信をスキップ');
      return;
    }
    
    addLog('✅ デバイスは登録済み - データ送信を実行します');

    // センサー読み取りシミュレーション
    addLog(`🔍 ${device.deviceType === 'electricity' ? '電流センサー' : '水流センサー'}を読み取り中...`);
    
    // ランダムな使用量データを生成（より現実的な値）
    const amount = device.deviceType === 'electricity' 
      ? Math.random() * 3 + 0.5 // 0.5-3.5 kWh (1時間あたりの一般的な消費量)
      : Math.random() * 15 + 2; // 2-17 L (1分間あたりの水使用量)

    const roundedAmount = Math.round(amount * 100) / 100;
    addLog(`📏 測定値: ${roundedAmount} ${device.deviceType === 'electricity' ? 'kWh' : 'L'}`);
    addLog(`🌐 サーバーへデータ送信中...`);

    try {
      const response = await fetch('/api/log-device-usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.NEXT_PUBLIC_ESP32_API_KEY || 'esp32-test-api-key-456',
        },
        body: JSON.stringify({
          deviceId: device.deviceId,
          usageType: device.deviceType,
          amount: roundedAmount,
        }),
      });

      const data = await response.json();

      if (data.success) {
        addLog(`✅ データ送信成功!`);
        addLog(`📊 使用量: ${roundedAmount} ${device.deviceType === 'electricity' ? 'kWh' : 'L'}`);
        addLog(`👤 ユーザー: ${data.data?.userId?.substring(0, 8)}...`);
        addLog(`⏰ 次回送信: 15秒後`);
        setLastDataSent(new Date());
        setTotalDataSent(prev => prev + 1);
        setConnectionStatus('connected');
        setFailedAttempts(0); // 成功時はエラーカウントをリセット
        
        // 水族館への影響をシミュレーション
        if (device.deviceType === 'water' && roundedAmount < 5) {
          addLog(`🌊 節水効果あり！水族館環境が向上します`);
        } else if (device.deviceType === 'electricity' && roundedAmount < 1) {
          addLog(`⚡ 省エネ効果あり！環境スコアが向上します`);
        }
        
      } else {
        addLog(`❌ データ送信失敗: ${data.message}`);
        addLog(`🔄 15秒後に再試行します`);
        setFailedAttempts(prev => prev + 1);
        setConnectionStatus('error');
      }
    } catch (error) {
      addLog(`❌ 通信エラー: ネットワーク接続を確認してください`);
      addLog(`🔄 次回送信時に再試行します`);
      setFailedAttempts(prev => prev + 1);
      setConnectionStatus('error');
      console.error('Data sending error:', error);
    }
  };;;

  const startDeviceConnection = (device: SimulatedDevice) => {
    setSelectedDevice(device);
    setIsConnected(true);
    setConnectionStatus('connecting');
    setConnectionStartTime(new Date());
    setFailedAttempts(0);
    addLog(`🔗 デバイス ${device.deviceId} に接続開始`);
    addLog(`📡 WiFi接続確認中...`);
    
    // WiFi接続シミュレーション（2秒後）
    setTimeout(() => {
      addLog(`✅ WiFi接続成功 (IP: 192.168.1.${Math.floor(Math.random() * 200 + 10)})`);
      addLog(`🔍 サーバー接続テスト中...`);
      
      // サーバー接続テスト（1秒後）
      setTimeout(() => {
        addLog(`✅ サーバー接続成功`);
        setConnectionStatus('connected');
        
        // デバイスが既に登録済みかどうかをチェック
        if (!device.isRegistered) {
          addLog(`⏱️ 登録状態を5秒間隔で確認します`);
          
          // 登録状態確認ループ - 単純化
          const checkRegistration = () => {
            setDevices(prevDevices => {
              const currentDevice = prevDevices.find(d => d.deviceId === device.deviceId);
              
              if (currentDevice?.isRegistered) {
                // 登録が完了している場合、データ送信開始
                addLog('🎉 デバイスがユーザーに登録されました！');
                addLog('🚀 データ送信モードを開始します');
                startDataSendingMode(currentDevice);
                return prevDevices;
              } else {
                // まだ登録されていない場合、サーバーに確認
                checkDeviceStatus(device).then(isRegistered => {
                  if (!isRegistered) {
                    // 5秒後に再確認
                    setTimeout(checkRegistration, 5000);
                  }
                }).catch(error => {
                  addLog(`❌ 登録確認エラー: ${error}`);
                  setTimeout(checkRegistration, 5000);
                });
                return prevDevices;
              }
            });
          };
          
          // 最初の確認を開始
          checkRegistration();
          
        } else {
          // 既に登録済みの場合は直接データ送信開始
          addLog(`📊 デバイスは登録済み - データ送信を開始します`);
          startDataSendingMode(device);
        }
      }, 1000);
    }, 2000);
  };;;;

  const startDataSendingMode = (device: SimulatedDevice) => {
    addLog('🚀 データ送信モード開始');
    addLog(`📋 送信対象デバイス: ${device.deviceId}`);
    addLog(`🔄 1分間隔でデータ送信を実行します`);
    
    // 既存のインターバルをクリア（重複防止）
    if (dataSendingInterval) {
      clearInterval(dataSendingInterval);
      addLog('🧹 既存のインターバルをクリアしました');
    }
    
    // 即座に最初のデータ送信を実行
    simulateDataSending(device);
    
    const dataInterval = setInterval(async () => {
      try {
        addLog('⏰ 定期データ送信実行中...');
        await simulateDataSending(device);
      } catch (error) {
        addLog(`❌ データ送信中にエラーが発生しました: ${error}`);
        setConnectionStatus('error');
        setFailedAttempts(prev => prev + 1);
        
        // 連続エラーが多い場合は自動再接続を試行
        if (failedAttempts >= 3) {
          addLog('🔄 自動再接続を試行します...');
          setTimeout(() => {
            if (selectedDevice) {
              startDeviceConnection(selectedDevice);
            }
          }, 5000);
        }
      }
    }, 60000); // 1分間隔（60秒）

    setDataSendingInterval(dataInterval);
    addLog('✅ データ送信インターバルを設定しました（1分間隔）');
  };;;

  const stopDeviceConnection = () => {
    addLog('🔌 デバイス接続を停止中...');
    
    // データ送信インターバルを確実にクリア
    if (dataSendingInterval) {
      clearInterval(dataSendingInterval);
      setDataSendingInterval(null);
      addLog('🧹 データ送信インターバルをクリアしました');
    } else {
      addLog('ℹ️ クリアするインターバルがありません');
    }
    
    // 接続状態をリセット
    setIsConnected(false);
    setSelectedDevice(null);
    setConnectionStatus('disconnected');
    setConnectionStartTime(null);
    setFailedAttempts(0); // エラーカウントをリセット
    
    addLog('✅ デバイス接続を完全に停止しました');
  };;

  // 接続時間の計算
  const getConnectionDuration = () => {
    if (!connectionStartTime) return '未接続';
    const duration = Date.now() - connectionStartTime.getTime();
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // 接続状態のステータス表示
  const getConnectionStatusDisplay = () => {
    switch (connectionStatus) {
      case 'connecting':
        return '🟡 接続中';
      case 'connected':
        return '🟢 接続済み';
      case 'error':
        return '🔴 エラー';
      default:
        return '⚫ 未接続';
    }
  };

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">ESP32 IoTデバイス シミュレーター</h1>
      
      {/* デバイス作成・登録セクション */}
      <div className="mb-8 p-6 bg-white rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">デバイス作成</h2>
        <div className="flex space-x-4 mb-4">
          <Button 
            onClick={() => createSimulatedDevice('electricity')}
            className="bg-yellow-500 hover:bg-yellow-600"
          >
            ⚡ 電気使用量センサー
          </Button>
          <Button 
            onClick={() => createSimulatedDevice('water')}
            className="bg-blue-500 hover:bg-blue-600"
          >
            💧 水道使用量センサー
          </Button>
        </div>
        
        {/* デバイスリスト */}
        <div className="space-y-2">
          {devices.map(device => (
            <div key={device.deviceId} className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <div className="flex-1">
                <span className="font-mono text-sm">{device.deviceId}</span>
                <span className={`ml-2 text-xs px-2 py-1 rounded ${device.isRegistered ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {device.isRegistered ? '登録済み' : '未登録'}
                </span>
                {device.registrationCode && (
                  <span className="ml-2 font-bold text-blue-600">
                    コード: {device.registrationCode}
                  </span>
                )}
              </div>
              <div className="flex space-x-2">
                {!device.registrationCode && (
                  <Button 
                    onClick={() => registerDevice(device)}
                    size="sm"
                    className="bg-green-500 hover:bg-green-600"
                  >
                    登録
                  </Button>
                )}
                {device.registrationCode && !isConnected && (
                  <Button 
                    onClick={() => startDeviceConnection(device)}
                    size="sm"
                    className="bg-blue-500 hover:bg-blue-600"
                  >
                    接続開始
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 左側: 制御パネルと状態表示 */}
        <div className="space-y-6">
          {/* 制御パネル */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">制御パネル</h2>
            <div className="space-y-2">
              {isConnected && selectedDevice && (
                <Button 
                  onClick={stopDeviceConnection}
                  className="bg-red-500 hover:bg-red-600 w-full"
                >
                  🔌 接続停止
                </Button>
              )}
              {!isConnected && (
                <p className="text-gray-600 text-center py-4">
                  デバイスを選択して接続してください
                </p>
              )}
            </div>
          </div>

          {/* 接続状態表示 - 改善版 */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">接続状態</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span>状態:</span>
                <span className="font-semibold">{getConnectionStatusDisplay()}</span>
              </div>
              
              {selectedDevice && (
                <div className="flex justify-between items-center">
                  <span>選択デバイス:</span>
                  <span className="font-mono text-sm">{selectedDevice.deviceId.split('_')[0]}_{selectedDevice.deviceId.split('_')[1]}</span>
                </div>
              )}
              
              {isConnected && (
                <div className="flex justify-between items-center">
                  <span>接続時間:</span>
                  <span className="font-mono">{getConnectionDuration()}</span>
                </div>
              )}
              
              {totalDataSent > 0 && (
                <div className="flex justify-between items-center">
                  <span>送信回数:</span>
                  <span className="font-semibold text-blue-600">{totalDataSent}回</span>
                </div>
              )}
              
              {lastDataSent && (
                <div className="flex justify-between items-center">
                  <span>最終送信:</span>
                  <span className="text-sm">{lastDataSent.toLocaleString('ja-JP')}</span>
                </div>
              )}
              
              {failedAttempts > 0 && (
                <div className="flex justify-between items-center">
                  <span>失敗回数:</span>
                  <span className="font-semibold text-red-600">{failedAttempts}回</span>
                </div>
              )}
              
              {connectionStatus === 'connected' && selectedDevice?.isRegistered && (
                <div className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                  <p className="text-green-700 text-sm">
                    ✅ デバイスは正常に動作中です
                  </p>
                </div>
              )}
              
              {connectionStatus === 'error' && (
                <div className="mt-2 p-2 bg-red-50 rounded border border-red-200">
                  <p className="text-red-700 text-sm">
                    ⚠️ 通信エラーが発生しています
                  </p>
                  {failedAttempts >= 3 && (
                    <p className="text-red-600 text-xs mt-1">
                      連続エラー: {failedAttempts}回 - 自動再接続を試行中
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右側: ログ表示 */}
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">シリアルモニター</h2>
              <div className="space-x-2">
                <Button onClick={addTestLog} size="sm" className="bg-blue-500 hover:bg-blue-600">
                  テストログ
                </Button>
                <Button onClick={clearLogs} size="sm" className="bg-gray-500 hover:bg-gray-600">
                  クリア
                </Button>
              </div>
            </div>
            <div 
              ref={logContainerRef}
              className="bg-black text-green-400 font-mono text-sm p-4 rounded h-96 overflow-y-auto"
              style={{ scrollBehavior: 'smooth' }}
            >
              {logs.length === 0 ? (
                <div className="mb-1 text-gray-500">ログがありません...</div>
              ) : (
                logs.map((log, index) => (
                  <div key={`log-${index}-${log.substring(0, 10)}`} className="mb-1 whitespace-pre-wrap">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 使用方法説明 */}
      <div className="mt-8 p-6 bg-blue-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-3">🔧 使用方法</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>「⚡電気使用量センサー」または「💧水道使用量センサー」ボタンでデバイスを作成</li>
          <li>作成されたデバイスの「登録」ボタンをクリックして登録コードを生成</li>
          <li>生成されたコードをメインのデバイス管理画面で入力してデバイスを紐付け</li>
          <li>「接続開始」ボタンでESP32の動作をシミュレーション開始</li>
          <li>シリアルモニターで動作状況を確認</li>
        </ol>
      </div>
    </div>
  );
}