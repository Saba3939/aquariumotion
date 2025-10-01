'use client';

import React from 'react';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import FishIcon from '@/components/fish-icon';

interface WelcomeDialogProps {
	isOpen: boolean;
	onClose: () => void;
	fishName?: string; // 初期魚の名前
}

export default function WelcomeDialog({ isOpen, onClose, fishName }: WelcomeDialogProps) {
	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="text-center text-xl font-bold text-blue-700">
						🎉 AQUARIUMOTIONへようこそ！
					</DialogTitle>
					<DialogDescription className="sr-only">
						AQUARIUMOTION水族館アプリへようこそ
					</DialogDescription>
				</DialogHeader>

				{/* メインコンテンツ */}
				<div className="text-center space-y-4 text-sm">
					<div className="space-y-3">
						<div className="bg-blue-50 p-3 rounded-lg">
							<div className="font-semibold text-blue-800">🌊 あなたの環境保護水族館</div>
							<div className="text-blue-600 text-xs mt-1">
								水の使用量を記録し、環境保護活動を通じて魚を育てましょう
							</div>
						</div>

						<div className="bg-green-50 p-3 rounded-lg">
							<div className="font-semibold text-green-800 flex items-center gap-2 justify-center">
								<FishIcon typeId={0} size={24} />
								初期の魚をお迎えしました
							</div>
							{fishName && (
								<div className="text-green-600 text-xs mt-1">
									「{fishName}」があなたの水族館で泳いでいます！
								</div>
							)}
						</div>

						<div className="bg-orange-50 p-3 rounded-lg">
							<div className="font-semibold text-orange-800">💡 使い方のヒント</div>
							<ul className="text-orange-600 text-xs mt-1 space-y-1 list-disc list-inside">
								<li>デバイスを登録して水使用量を自動記録</li>
								<li>節約行動で環境レベルをアップ</li>
								<li>魚を育てて新しい仲間を増やそう</li>
							</ul>
						</div>
					</div>
				</div>

				<DialogFooter className="sm:justify-center">
					<Button
						onClick={onClose}
						className="w-full bg-blue-600 hover:bg-blue-700 text-white"
					>
						水族館を始める 🏁
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}