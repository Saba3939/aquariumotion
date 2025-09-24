"use client";

import { useState } from "react";
import { User } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, CreditCard, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface ICCardRegistrationProps {
  user: User;
}

interface ICCard {
  cardId: string;
  isActive: boolean;
  registeredAt: string;
  lastUsedAt?: string;
}

export default function ICCardRegistration({ user }: ICCardRegistrationProps) {
  const [cardId, setCardId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [registeredCard, setRegisteredCard] = useState<ICCard | null>(null);
  const [isCheckingCard, setIsCheckingCard] = useState(false);

  // 登録済みカード確認
  const checkRegisteredCard = async () => {
    setIsCheckingCard(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/register-ic-card', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      if (result.success && result.data.hasCard) {
        setRegisteredCard(result.data.card);
      } else {
        setRegisteredCard(null);
      }
    } catch (error) {
      console.error('カード確認エラー:', error);
      toast.error('カード情報の確認に失敗しました');
    } finally {
      setIsCheckingCard(false);
    }
  };

  // ICカード登録
  const registerCard = async () => {
    if (!cardId.trim()) {
      toast.error('カードIDを入力してください');
      return;
    }

    setIsLoading(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/register-ic-card', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cardId: cardId.trim()
        })
      });

      const result = await response.json();
      if (result.success) {
        toast.success('ICカードを登録しました！');
        setCardId("");
        await checkRegisteredCard(); // 登録後に情報を更新
      } else {
        toast.error(result.error || 'カード登録に失敗しました');
      }
    } catch (error) {
      console.error('カード登録エラー:', error);
      toast.error('カード登録に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // ICカード削除
  const deleteCard = async () => {
    if (!registeredCard) return;

    if (!confirm('ICカードの登録を削除しますか？\n水使用量測定ができなくなります。')) {
      return;
    }

    setIsLoading(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/register-ic-card', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      if (result.success) {
        toast.success('ICカードの登録を削除しました');
        setRegisteredCard(null);
      } else {
        toast.error(result.error || 'カード削除に失敗しました');
      }
    } catch (error) {
      console.error('カード削除エラー:', error);
      toast.error('カード削除に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 初回レンダリング時にカード情報をチェック
  useState(() => {
    checkRegisteredCard();
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            ICカード登録
          </CardTitle>
          <CardDescription>
            水使用量測定に使用するICカードを登録してください。
            1つのアカウントにつき1枚のカードのみ登録できます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {registeredCard ? (
            // 登録済みカード表示
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-800">登録済み</p>
                      <p className="text-sm text-green-600">
                        カードID: {registeredCard.cardId}
                      </p>
                    </div>
                  </div>
                  <Badge variant={registeredCard.isActive ? "default" : "secondary"}>
                    {registeredCard.isActive ? "有効" : "無効"}
                  </Badge>
                </div>
                <div className="mt-2 text-xs text-green-600">
                  <p>登録日: {new Date(registeredCard.registeredAt).toLocaleDateString('ja-JP')}</p>
                  {registeredCard.lastUsedAt && (
                    <p>最終使用: {new Date(registeredCard.lastUsedAt).toLocaleDateString('ja-JP')}</p>
                  )}
                </div>
              </div>

              <Button
                variant="destructive"
                size="sm"
                onClick={deleteCard}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                カード登録を削除
              </Button>
            </div>
          ) : (
            // カード登録フォーム
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium">ICカード登録手順</p>
                    <ol className="mt-2 space-y-1 list-decimal list-inside">
                      <li>お持ちのICカードの表面に記載されているIDを確認</li>
                      <li>カードIDを下の入力欄に正確に入力</li>
                      <li>「登録」ボタンを押す</li>
                      <li>登録完了後、水使用量測定時にそのカードをご利用ください</li>
                    </ol>
                    <p className="mt-2 text-xs text-blue-700">
                      ※ カードIDは通常、ICカードの表面に印字されている英数字です
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="cardId" className="text-sm font-medium">
                  カードID
                </label>
                <Input
                  id="cardId"
                  placeholder="例)10016102****"
                  value={cardId}
                  onChange={(e) => setCardId(e.target.value)}
                  disabled={isLoading}
                />
                <p className="text-xs text-gray-500">
                  カード表面に印字されているIDをそのまま入力してください
                </p>
              </div>

              <Button
                onClick={registerCard}
                disabled={isLoading || !cardId.trim()}
                className="w-full"
              >
                {isLoading ? '登録中...' : 'ICカードを登録'}
              </Button>
            </div>
          )}

          <Button
            variant="outline"
            onClick={checkRegisteredCard}
            disabled={isCheckingCard}
            className="w-full"
          >
            {isCheckingCard ? '確認中...' : '登録状況を再確認'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
