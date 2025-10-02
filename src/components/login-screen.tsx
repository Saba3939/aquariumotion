import { Button } from "@/components/ui/button";
import Image from "next/image";
import { FaGoogle } from "react-icons/fa";

interface LoginScreenProps {
	authError: string | null;
	signInWithGoogle: () => Promise<void>;
	signInWithGoogleRedirect: () => Promise<void>;
}

export default function LoginScreen({
	authError,
	signInWithGoogle,
	signInWithGoogleRedirect,
}: LoginScreenProps) {
	return (
		<div className='min-h-screen bg-[#66B5D3] flex items-center justify-center relative overflow-hidden'>
			{/* 背景の波のアニメーション */}
			<div className='absolute inset-0 opacity-20'>
				<div className='absolute bottom-0 left-0 w-full h-64 bg-gradient-to-t from-blue-500/30 to-transparent animate-wave'></div>
			</div>

			<div className='glass rounded-3xl shadow-2xl p-8 sm:p-10 max-w-md w-full mx-4 border border-white/40 relative z-10 backdrop-blur-xl'>
				<div className='text-center mb-8'>
					<div className='mb-6 flex justify-center'>
						<Image
							src='/aquariumotion-icon.png'
							alt='AQUARIUMOTION'
							width={120}
							height={120}
							className='drop-shadow-2xl'
						/>
					</div>
					<h1 className='text-3xl font-bold mb-3'>
						<span className='bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 bg-clip-text text-transparent'>
							AQUARIUMOTION
						</span>
					</h1>
					<p className='text-gray-700 font-medium'>あなたの水槽にログインしてください</p>
					<div className='mt-2 text-xs text-gray-600'>環境保護バーチャル水族館</div>
				</div>
				{authError && (
					<div className='mb-4 p-4 bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-300/50 rounded-xl text-red-700 text-sm shadow-md'>
						<strong className='font-bold'>ログインエラー:</strong> {authError}
					</div>
				)}
				<div className='space-y-3'>
					<Button
						onClick={signInWithGoogle}
						className='w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white py-4 text-lg font-semibold shadow-lg transition-smooth transform hover:scale-105'
					>
						<FaGoogle className='mr-2' />
						Googleでログイン
					</Button>
				</div>
			</div>
		</div>
	);
}
