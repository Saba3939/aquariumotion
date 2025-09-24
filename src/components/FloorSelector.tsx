'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { User } from 'firebase/auth';

interface FloorSelectorProps {
  user: User | null;
  onFloorSet?: (floor: number) => void;
}

export default function FloorSelector({ user, onFloorSet }: FloorSelectorProps) {
  const [building, setBuilding] = useState<string>('');
  const [floor, setFloor] = useState<string>('');
  const [currentFloor, setCurrentFloor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // 現在のフロア情報を取得
  useEffect(() => {
    if (!user) return;

    const fetchCurrentFloor = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/set-floor', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();
        if (data.success && data.floor) {
          setCurrentFloor(data.floor);
          const buildingNum = Math.floor(data.floor / 10);
          const floorNum = data.floor % 10;
          setBuilding(buildingNum.toString());
          setFloor(floorNum.toString());
        }
      } catch (error) {
        console.error('フロア情報取得エラー:', error);
      } finally {
        setFetching(false);
      }
    };

    fetchCurrentFloor();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error('ユーザーが認証されていません');
      return;
    }

    if (!building || !floor) {
      toast.error('号館と階数を両方選択してください');
      return;
    }

    const buildingNum = parseInt(building);
    const floorNum = parseInt(floor);
    const floorValue = buildingNum * 10 + floorNum;

    setLoading(true);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/set-floor', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ floor: floorValue }),
      });

      const data = await response.json();

      if (data.success) {
        setCurrentFloor(floorValue);
        toast.success(`フロア設定完了: ${building}号館${floor}階`, {
          description: `フロア番号: ${floorValue}`,
          duration: 3000,
        });
        onFloorSet?.(floorValue);
      } else {
        toast.error('フロア設定に失敗しました', {
          description: data.error || '不明なエラー',
          duration: 4000,
        });
      }
    } catch (error) {
      console.error('フロア設定エラー:', error);
      toast.error('フロア設定に失敗しました', {
        description: 'ネットワークエラーまたはサーバーエラー',
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>🏢 フロア設定</CardTitle>
          <CardDescription>現在の設定を読み込み中...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>🏢 フロア設定</CardTitle>
        <CardDescription>
          あなたの所在フロアを設定してください
        </CardDescription>
        {currentFloor && (
          <div className="text-sm text-green-600 bg-green-50 p-2 rounded">
            現在の設定: {Math.floor(currentFloor / 10)}号館{currentFloor % 10}階 (#{currentFloor})
          </div>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="building" className="block text-sm font-medium text-gray-700">号館</label>
              <select
                id="building"
                value={building}
                onChange={(e) => setBuilding(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">選択</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <option key={num} value={num.toString()}>
                    {num}号館
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="floor" className="block text-sm font-medium text-gray-700">階数</label>
              <select
                id="floor"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">選択</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <option key={num} value={num.toString()}>
                    {num}階
                  </option>
                ))}
              </select>
            </div>
          </div>

          {building && floor && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-800">
                <div className="font-medium">設定予定:</div>
                <div>{building}号館{floor}階</div>
                <div className="text-xs text-blue-600">
                  フロア番号: {parseInt(building) * 10 + parseInt(floor)}
                </div>
              </div>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !building || !floor}
          >
            {loading ? '設定中...' : 'フロアを設定'}
          </Button>
        </form>

        <div className="mt-4 text-xs text-gray-500 space-y-1">
          <div>💡 フロア番号は2桁の数字で管理されます</div>
          <div>例: 6号館1階 → 61、2号館3階 → 23</div>
        </div>
      </CardContent>
    </Card>
  );
}