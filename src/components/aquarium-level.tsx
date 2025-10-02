import { Aquarium } from "@/types/aquarium";

interface AquariumLevelProps {
	aquariumData: Aquarium | null;
}

export default function AquariumLevel({ aquariumData }: AquariumLevelProps) {
	const enviromentLevel = aquariumData?.enviromentLevel || 0;
	const isLowEnvironmentLevel = enviromentLevel <= 30; // 環境レベル30以下を低レベルとする

	return (
		<div className='glass rounded-3xl shadow-xl p-6 space-y-6 border border-white/40 transition-smooth hover:shadow-2xl'>
			{/* 節約メータ */}
			<div>
				<div className='flex items-center justify-between mb-3'>
					<span className='text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent'>
						節約メータ
					</span>
					<span className='text-2xl font-bold text-blue-600 px-4 py-1 bg-blue-50 rounded-full border border-blue-200'>
						{aquariumData?.conservationMeter || 0}
					</span>
				</div>
				<div className='w-full bg-gray-200/50 rounded-full h-4 overflow-hidden shadow-inner'>
					<div
						className='bg-gradient-to-r from-blue-500 to-cyan-500 h-4 rounded-full transition-all duration-500 shadow-lg'
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
				<div className='flex items-center justify-between mb-3'>
					<span className={`text-3xl font-bold bg-gradient-to-r ${
						isLowEnvironmentLevel ? 'from-red-600 to-orange-600' : 'from-green-600 to-emerald-600'
					} bg-clip-text text-transparent`}>
						環境レベル
					</span>
					<span className={`text-2xl font-bold px-4 py-1 rounded-full border ${
						isLowEnvironmentLevel
							? 'text-red-600 bg-red-50 border-red-200'
							: 'text-green-600 bg-green-50 border-green-200'
					}`}>
						{enviromentLevel}
					</span>
				</div>
				<div className='w-full bg-gray-200/50 rounded-full h-4 overflow-hidden shadow-inner'>
					<div
						className={`h-4 rounded-full transition-all duration-500 shadow-lg ${
							isLowEnvironmentLevel
								? 'bg-gradient-to-r from-red-500 to-orange-500'
								: 'bg-gradient-to-r from-green-500 to-emerald-500'
						}`}
						style={{
							width: `${Math.min(enviromentLevel, 100)}%`,
						}}
					></div>
				</div>

				{/* 低環境レベル警告 */}
				{isLowEnvironmentLevel && (
					<div className='mt-4 p-4 bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-300/50 rounded-xl shadow-md'>
						<div className='flex items-center gap-3'>
							<div className='flex-1'>
								<p className='text-sm font-semibold text-red-800'>
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
