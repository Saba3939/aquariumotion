import { Button } from "@/components/ui/button";
import { Fish, Aquarium } from "@/types/aquarium";

interface FishStatusProps {
	fishData: Fish[];
	aquariumData: Aquarium | null;
	hatchEgg: () => Promise<void>;
	discardEgg: (count: number) => Promise<void>;
	sendFishToLinkAquarium: () => void;
	loading: boolean;
}

export default function FishStatus({
	fishData,
	aquariumData,
	hatchEgg,
	discardEgg,
	sendFishToLinkAquarium,
	loading
}: FishStatusProps) {
	// raising状態の魚がいるかチェック
	const raisingFishCount = fishData.filter(fish => fish.status === 'raising').length;

	return (
		<div className='bg-white rounded-2xl shadow-lg p-6'>
			<h2 className='text-xl font-semibold text-gray-800 mb-4 flex items-center'>
				🐠 魚のステータス
			</h2>

			{/* Link水槽への魚送信機能 */}
			{fishData.length > 0 && raisingFishCount > 0 && (
				<div className='mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200'>
					<div className='flex items-center justify-between'>
						<div>
							<h3 className='font-medium text-blue-800 flex items-center'>
								🔗 Link水槽
							</h3>
							<p className='text-sm text-blue-600 mt-1'>
								魚をLink水槽に送って他のユーザーと交流しましょう（1匹まで）
							</p>
						</div>
						<Button
							onClick={sendFishToLinkAquarium}
							className="bg-blue-500 hover:bg-blue-600 text-white"
							disabled={loading}
							size="sm"
						>
							🏊‍♀️ 魚を送る
						</Button>
					</div>
				</div>
			)}

			{fishData.length > 0 ? (
				<div className='space-y-3'>
					{fishData.map((fish) => (
						<div
							key={fish.id}
							className={`flex items-center justify-between p-4 rounded-lg transition-all duration-300 ${
								fish.eggMeter >= 3
									? 'bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-200 shadow-lg animate-pulse'
									: 'bg-blue-50'
							}`}
						>
							<div className='flex items-center space-x-4'>
								<div className='text-4xl'>
									🐠
								</div>
								<div>
									<h3 className='font-medium text-gray-800'>
										{fish.fish_name}
									</h3>
									<p className='text-sm text-gray-600'>
										成長レベル: {fish.growthLevel} | 状態: {fish.status}
									</p>
								</div>
							</div>
							<div className='text-right'>
								<div className={`text-sm mb-2 ${
									fish.eggMeter >= 3 ? 'text-orange-600 font-semibold animate-bounce' : 'text-gray-600'
								}`}>
									{fish.eggMeter >= 3 ? '✨ エッグメーター満タン！' : 'エッグメーター'}
								</div>
								<div className='flex items-center gap-1'>
									{[...Array(3)].map((_, index) => (
										<div
											key={index}
											className={`w-6 h-8 rounded-full border-2 border-orange-300 flex items-center justify-center text-sm transition-all duration-300 ${
												index < fish.eggMeter
													? fish.eggMeter >= 3
														? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white shadow-lg border-yellow-300 animate-pulse'
														: 'bg-orange-400 text-white'
													: 'bg-orange-100'
											}`}
										>
										</div>
									))}
								</div>
								<div className='text-xs text-gray-500 mt-1'>
									{fish.eggMeter}/3
								</div>
							</div>
						</div>
					))}
				</div>
			) : (
				<div className='text-center py-8 text-gray-500'>
					<p>まだ魚がいません。</p>
					{(aquariumData?.unhatchedEggCount || 0) > 0 ? (
						<div className='mt-4 space-y-3'>
							<div className='flex items-center justify-center space-x-2'>
								<span className='text-2xl'>🥚</span>
								<span className='text-lg font-medium text-gray-700'>
									孵化できる卵: {aquariumData?.unhatchedEggCount}個
								</span>
							</div>
							<div className='flex gap-3 justify-center'>
								<Button onClick={hatchEgg} className='bg-orange-500 hover:bg-orange-600'>
									🐣 卵を孵化する
								</Button>
								<Button
									onClick={() => discardEgg(1)}
									variant="outline"
									className='border-red-300 text-red-600 hover:bg-red-50'
								>
									🗑️ 卵を放棄する
								</Button>
							</div>
						</div>
					) : (
						<div className='mt-4 text-gray-400'>
							<p>卵がありません。環境保護活動を続けて卵を獲得しましょう！</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
}