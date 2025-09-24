import { Button } from "@/components/ui/button";

interface DebugToolsProps {
	forceProcessDailyUsage: () => Promise<void>;
	logFishStatus: () => void;
	resetFishStatus: () => Promise<void>;
	loading: boolean;
}

export default function DebugTools({
	forceProcessDailyUsage,
	logFishStatus,
	resetFishStatus,
	loading
}: DebugToolsProps) {
	return (
		<div className='bg-white rounded-2xl shadow-lg p-6'>
			<h2 className='text-xl font-semibold text-gray-800 mb-4 flex items-center'>
				🔧 デバッグ・テスト用ツール
			</h2>
			<div className="flex flex-wrap gap-3">
				<Button
					onClick={forceProcessDailyUsage}
					variant="outline"
					className="border-blue-300 text-blue-600 hover:bg-blue-50"
					disabled={loading}
				>
					🔄 dailyUsage処理を強制実行
				</Button>
			</div>
		</div>
	);
}
