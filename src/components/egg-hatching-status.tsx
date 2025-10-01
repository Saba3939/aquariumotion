import { Button } from "@/components/ui/button";
import { Aquarium } from "@/types/aquarium";

interface EggHatchingStatusProps {
	aquariumData: Aquarium | null;
	hatchEgg: () => Promise<void>;
	discardEgg: (count: number) => Promise<void>;
}

export default function EggHatchingStatus({
	aquariumData,
	hatchEgg,
	discardEgg
}: EggHatchingStatusProps) {
	return (
		<div className='bg-white rounded-2xl shadow-lg p-6'>
			<h2 className='text-xl font-semibold text-gray-800 mb-4 flex items-center'>
				<div className='w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center mr-2'>
					<div className='w-4 h-4 bg-orange-400 rounded-full'></div>
				</div>
				たまごの孵化
			</h2>
			<div className='flex items-center justify-between'>
				<div className='flex items-center space-x-3'>
					<div className='w-16 h-16 bg-gradient-to-br from-orange-200 to-orange-300 rounded-full flex items-center justify-center border-2 border-orange-400'>
						<div className='w-10 h-12 bg-orange-100 rounded-full border border-orange-300'></div>
					</div>
					<div>
						<div className='text-2xl font-bold text-orange-600'>
							{aquariumData?.unhatchedEggCount || 0} 個
						</div>
						<p className='text-sm text-gray-600'>孵化待ちのたまご</p>
					</div>
				</div>
				<div>
					{(aquariumData?.unhatchedEggCount || 0) > 0 ? (
						<div className='flex flex-col gap-2'>
							<Button
								onClick={hatchEgg}
								className='bg-orange-500 hover:bg-orange-600 text-white px-6 py-2'
							>
								たまごを孵化する
							</Button>
							<Button
								onClick={() => discardEgg(1)}
								variant="outline"
								className='border-red-300 text-red-600 hover:bg-red-50 px-6 py-2'
							>
								たまごを放棄する
							</Button>
						</div>
					) : (
						<div className='text-gray-400 text-sm text-center'>
							<p>たまごがありません</p>
							<p className='text-xs mt-1'>節約行動でたまごを獲得しよう！</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
