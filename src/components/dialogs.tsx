import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Fish } from "@/types/aquarium";

interface DialogsProps {
	// 魚誕生ダイアログ
	showBirthDialog: boolean;
	setShowBirthDialog: (show: boolean) => void;
	newBornFish: Fish | null;

	// 魚選択ダイアログ
	showFishSelectionDialog: boolean;
	setShowFishSelectionDialog: (show: boolean) => void;
	fishData: Fish[];
	releaseFish: (fishId: string) => Promise<void>;
}

export function FishBirthDialog({
	showBirthDialog,
	setShowBirthDialog,
	newBornFish
}: Pick<DialogsProps, 'showBirthDialog' | 'setShowBirthDialog' | 'newBornFish'>) {
	return (
		<Dialog open={showBirthDialog} onOpenChange={setShowBirthDialog}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>🎉 新しい魚が誕生しました！</DialogTitle>
				</DialogHeader>
				<div className='text-center py-4'>
					<div className='text-6xl mb-4'>🐠</div>
					<div className='text-lg font-semibold'>
						{newBornFish?.fish_name}
					</div>
					<div className='text-gray-600 mt-2'>
						あなたのエコ活動が新しい生命を育みました！
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function FishSelectionDialog({
	showFishSelectionDialog,
	setShowFishSelectionDialog,
	fishData,
	releaseFish
}: Pick<DialogsProps, 'showFishSelectionDialog' | 'setShowFishSelectionDialog' | 'fishData' | 'releaseFish'>) {
	return (
		<Dialog open={showFishSelectionDialog} onOpenChange={setShowFishSelectionDialog}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>🐠 魚を手放してください</DialogTitle>
					<DialogDescription>
						水族館の上限は3匹です。新しい魚を迎えるために、既存の魚を1匹手放してください。
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3 mt-4">
					{fishData.map((fish) => (
						<div
							key={fish.id}
							className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
						>
							<div className="flex items-center space-x-3">
								<div className="text-3xl">🐠</div>
								<div>
									<h3 className="font-medium text-gray-800">
										{fish.fish_name}
									</h3>
									<p className="text-sm text-gray-600">
										成長レベル: {fish.growthLevel} | エッグメーター: {fish.eggMeter}/3
									</p>
								</div>
							</div>
							<Button
								onClick={() => releaseFish(fish.id)}
								variant="destructive"
								size="sm"
								className="bg-red-500 hover:bg-red-600"
							>
								手放す
							</Button>
						</div>
					))}
				</div>
				<div className="mt-4 text-center">
					<Button
						onClick={() => setShowFishSelectionDialog(false)}
						variant="outline"
						className="w-full"
					>
						キャンセル
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export default function Dialogs(props: DialogsProps) {
	return (
		<>
			<FishBirthDialog
				showBirthDialog={props.showBirthDialog}
				setShowBirthDialog={props.setShowBirthDialog}
				newBornFish={props.newBornFish}
			/>
			<FishSelectionDialog
				showFishSelectionDialog={props.showFishSelectionDialog}
				setShowFishSelectionDialog={props.setShowFishSelectionDialog}
				fishData={props.fishData}
				releaseFish={props.releaseFish}
			/>
		</>
	);
}