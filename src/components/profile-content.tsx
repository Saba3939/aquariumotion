'use client';

import { useEffect, useState } from 'react';
import { User as UserIcon, Building2, Mail, Calendar, IdCard } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import FloorSelector from '@/components/FloorSelector';
import { toast } from 'sonner';
import { User } from 'firebase/auth';

interface ProfileContentProps {
  user: User;
  handleSignOut: () => void;
}

export default function ProfileContent({ user, handleSignOut }: ProfileContentProps) {
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

  return (
    <div className='space-y-6'>
      <h1 className='text-3xl font-bold mb-8'>
        <span className='bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent'>
          プロフィール
        </span>
      </h1>

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        {/* ユーザー情報カード */}
        <div className='lg:col-span-1'>
          <Card className='glass border-white/40'>
            <CardHeader className='text-center'>
              <div className='flex justify-center mb-4'>
                {user.photoURL ? (
                  <Image
                    src={user.photoURL}
                    alt='プロフィール画像'
                    width={80}
                    height={80}
                    className='rounded-full ring-4 ring-white/50'
                  />
                ) : (
                  <div className='w-20 h-20 bg-white/20 rounded-full flex items-center justify-center ring-4 ring-white/50'>
                    <UserIcon className='w-10 h-10 text-gray-600' />
                  </div>
                )}
              </div>
              <CardTitle className='text-xl text-gray-800'>{user.displayName || 'ユーザー'}</CardTitle>
              <CardDescription className='flex items-center justify-center gap-2'>
                <Mail className='w-4 h-4' />
                {user.email}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='flex items-center justify-between'>
                <span className='text-sm text-gray-600'>ユーザーID</span>
                <Badge variant='outline' className='font-mono text-xs bg-white/50'>
                  {user.uid.substring(0, 8)}...
                </Badge>
              </div>
              <div className='flex items-center justify-between'>
                <span className='text-sm text-gray-600 flex items-center gap-2'>
                  <Building2 className='w-4 h-4' />
                  所在フロア
                </span>
                <Badge variant={userFloor ? 'default' : 'secondary'} className='bg-blue-500'>
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
          <Card className='glass border-white/40'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-gray-800'>
                <Building2 className='w-6 h-6 text-blue-600' />
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
          <Card className='mt-6 glass border-white/40'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-gray-800'>
                <IdCard className='w-6 h-6 text-cyan-600' />
                アカウント管理
              </CardTitle>
              <CardDescription>
                アカウントに関する操作を行えます。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='space-y-4'>
                <div className='p-4 bg-white/30 rounded-lg'>
                  <h4 className='font-medium text-gray-800 mb-2'>認証プロバイダー</h4>
                  <div className='flex items-center gap-2'>
                    <Badge className='bg-blue-500'>Google</Badge>
                    <span className='text-sm text-gray-700'>
                      Googleアカウントでログイン中
                    </span>
                  </div>
                </div>

                <div className='pt-4 border-t border-white/20'>
                  <Button
                    onClick={handleSignOut}
                    variant='outline'
                    className='text-red-600 hover:text-red-700 hover:border-red-300 bg-white/50'
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
  );
}
