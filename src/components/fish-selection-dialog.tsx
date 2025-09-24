import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Fish } from "@/types/aquarium";

interface FishSelectionDialogProps {
	isOpen: boolean;
	onClose: () => void;
	fishData: Fish[];
	onSelectFish: (fishId: string) => void;
	title: string;
	description: string;
	filterStatus?: string;
}

export default function FishSelectionDialog({
	isOpen,
	onClose,
	fishData,
	onSelectFish,
	title,
	description,
	filterStatus
}: FishSelectionDialogProps) {
	// フィルターが指定されている場合はそのステータスの魚のみ表示
	const filteredFish = filterStatus
		? fishData.filter(fish => fish.status === filterStatus)
		: fishData;

	const handleSelectFish = (fishId: string) => {
		onSelectFish(fishId);
		onClose();
	};

	if (filteredFish.length === 0) {
		return (
			<Dialog open={isOpen} onOpenChange={onClose}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription>
							対象となる魚が見つかりませんでした。
						</DialogDescription>
					</DialogHeader>
					<div className="flex justify-end">
						<Button onClick={onClose} variant="outline">
							閉じる
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-4">
					{filteredFish.map((fish) => (
						<div
							key={fish.id}
							className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
						>
							<div className="flex-1">
								<div className="flex items-center gap-3">
									<div className="text-2xl">🐟</div>
									<div>
										<h3 className="font-medium text-gray-900">
											{fish.fish_name}
										</h3>
										<div className="text-sm text-gray-500 space-y-1">
											<p>ステータス: {fish.status}</p>
											<p>成長レベル: {fish.growthLevel}</p>
											<p>卵メーター: {fish.eggMeter}/3</p>
											<p>誕生日: {fish.birthDate?.toDate?.()?.toLocaleDateString() || '不明'}</p>
										</div>
									</div>
								</div>
							</div>
							<Button
								onClick={() => handleSelectFish(fish.id)}
								className="ml-4"
								size="sm"
							>
								選択
							</Button>
						</div>
					))}
				</div>

				<div className="flex justify-end gap-2">
					<Button onClick={onClose} variant="outline">
						キャンセル
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}