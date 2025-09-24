'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, ArrowLeft, Building2, Mail, Calendar, IdCard } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import FloorSelector from '@/components/FloorSelector';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export default function ProfilePage() {
  const router = useRouter();
  const { user, authLoading, handleSignOut } = useAuth();
  const [userFloor, setUserFloor] = useState<number | null>(null);
  const [loadingFloor, setLoadingFloor] = useState(true);

  // 現在のフロア情報を取得
  useEffect(() => {
    if (!user) return;

    const fetchUserFloor = async () => {
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
          setUserFloor(data.floor);
        }
      } catch (error) {
        console.error('フロア情報取得エラー:', error);
      } finally {
        setLoadingFloor(false);
      }
    };

    fetchUserFloor();
  }, [user]);

  const handleFloorSet = (floor: number) => {
    setUserFloor(floor);
    toast.success('フロア設定が更新されました', {
      description: `${Math.floor(floor / 10)}号館${floor % 10}階に設定されました`,
      duration: 3000,
    });
  };

  const formatFloor = (floor: number | null) => {
    if (!floor) return '未設定';
    const building = Math.floor(floor / 10);
    const floorNum = floor % 10;
    return `${building}号館${floorNum}階`;
  };

  // 認証ローディング中
  if (authLoading) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center'>
        <div className='text-center'>
          <div className='text-6xl mb-4'>🐠</div>
          <p className='text-blue-600'>認証状態を確認中...</p>
        </div>
      </div>
    );
  }

  // ログインしていない場合はホームにリダイレクト
  if (!user) {
    router.push('/');
    return null;
  }

  return (
    <div className='min-h-screen bg-gradient-to-br from-blue-50 to-green-50'>
      <div className='max-w-4xl mx-auto px-4 py-8'>
        {/* ヘッダー */}
        <div className='flex items-center gap-4 mb-8'>
          <Button
            variant='outline'
            onClick={() => router.push('/')}
            className='flex items-center gap-2'
          >
            <ArrowLeft className='w-4 h-4' />
            ホームに戻る
          </Button>
          <h1 className='text-3xl font-bold text-gray-800'>プロフィール</h1>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          {/* ユーザー情報カード */}
          <div className='lg:col-span-1'>
            <Card>
              <CardHeader className='text-center'>
                <div className='flex justify-center mb-4'>
                  {user.photoURL ? (
                    <Image
                      src={user.photoURL}
                      alt='プロフィール画像'
                      width={80}
                      height={80}
                      className='rounded-full'
                    />
                  ) : (
                    <div className='w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center'>
                      <User className='w-10 h-10 text-gray-500' />
                    </div>
                  )}
                </div>
                <CardTitle className='text-xl'>{user.displayName || 'ユーザー'}</CardTitle>
                <CardDescription className='flex items-center justify-center gap-2'>
                  <Mail className='w-4 h-4' />
                  {user.email}
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <span className='text-sm text-gray-600'>ユーザーID</span>
                  <Badge variant='outline' className='font-mono text-xs'>
                    {user.uid.substring(0, 8)}...
                  </Badge>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-sm text-gray-600 flex items-center gap-2'>
                    <Building2 className='w-4 h-4' />
                    所在フロア
                  </span>
                  <Badge variant={userFloor ? 'default' : 'secondary'}>
                    {loadingFloor ? '読み込み中...' : formatFloor(userFloor)}
                  </Badge>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-sm text-gray-600 flex items-center gap-2'>
                    <Calendar className='w-4 h-4' />
                    作成日
                  </span>
                  <span className='text-sm text-gray-800'>
                    {user.metadata.creationTime
                      ? new Date(user.metadata.creationTime).toLocaleDateString('ja-JP')
                      : '不明'
                    }
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* フロア設定カード */}
          <div className='lg:col-span-2'>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Building2 className='w-6 h-6' />
                  フロア設定
                </CardTitle>
                <CardDescription>
                  あなたの現在の所在フロアを設定してください。この情報は使用量データの分析に使用されます。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FloorSelector user={user} onFloorSet={handleFloorSet} />
              </CardContent>
            </Card>

            {/* アカウント管理カード */}
            <Card className='mt-6'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <IdCard className='w-6 h-6' />
                  アカウント管理
                </CardTitle>
                <CardDescription>
                  アカウントに関する操作を行えます。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='space-y-4'>
                  <div className='p-4 bg-gray-50 rounded-lg'>
                    <h4 className='font-medium text-gray-800 mb-2'>認証プロバイダー</h4>
                    <div className='flex items-center gap-2'>
                      <Badge>Google</Badge>
                      <span className='text-sm text-gray-600'>
                        Googleアカウントでログイン中
                      </span>
                    </div>
                  </div>

                  <div className='pt-4 border-t border-gray-200'>
                    <Button
                      onClick={handleSignOut}
                      variant='outline'
                      className='text-red-600 hover:text-red-700 hover:border-red-300'
                    >
                      ログアウト
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}