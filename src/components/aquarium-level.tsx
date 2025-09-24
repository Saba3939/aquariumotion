import { Aquarium } from "@/types/aquarium";

interface AquariumLevelProps {
	aquariumData: Aquarium | null;
}

export default function AquariumLevel({ aquariumData }: AquariumLevelProps) {
	const enviromentLevel = aquariumData?.enviromentLevel || 0;
	const isLowEnvironmentLevel = enviromentLevel <= 30; // 環境レベル30以下を低レベルとする

	return (
		<div className='bg-white rounded-2xl shadow-lg p-6 space-y-6'>
			{/* 節約メーター */}
			<div>
				<div className='text-3xl font-bold text-blue-600 mb-2'>
					節約メーター {aquariumData?.conservationMeter || 0}
				</div>
				<div className='w-full bg-gray-200 rounded-full h-3'>
					<div
						className='bg-blue-500 h-3 rounded-full transition-all duration-300'
						style={{
							width: `${Math.min(
								((aquariumData?.conservationMeter || 0) % 100) || 0,
								100
							)}%`,
						}}
					></div>
				</div>
			</div>

			{/* 環境レベル */}
			<div>
				<div className='text-3xl font-bold text-green-600 mb-2'>
					環境レベル {enviromentLevel}
				</div>
				<div className='w-full bg-gray-200 rounded-full h-3'>
					<div
						className={`h-3 rounded-full transition-all duration-300 ${
							isLowEnvironmentLevel ? 'bg-red-500' : 'bg-green-500'
						}`}
						style={{
							width: `${Math.min(enviromentLevel, 100)}%`,
						}}
					></div>
				</div>

				{/* 低環境レベル警告 */}
				{isLowEnvironmentLevel && (
					<div className='mt-3 p-3 bg-red-50 border border-red-200 rounded-lg'>
						<div className='flex items-center'>
							<span className='text-red-500 text-lg mr-2'>⚠️</span>
							<div>
								<p className='text-sm font-medium text-red-800'>
									環境レベルが低下しています
								</p>
								<p className='text-xs text-red-600 mt-1'>
									環境保護行動を増やして水族館の環境を改善しましょう
								</p>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
