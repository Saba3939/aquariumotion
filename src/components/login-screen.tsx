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
		<div className='min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center'>
			<div className='bg-white rounded-2xl shadow-lg p-8 max-w-md w-full mx-4'>
				<div className='text-center mb-8'>
					<div className='mb-4 flex justify-center'>
						<Image
							src='/aquariumotion-icon.png'
							alt='AQUARIUMOTION'
							width={96}
							height={96}
						/>
					</div>
					<h1 className='text-2xl font-bold text-gray-800 mb-2'>
						AQUARIUMOTION
					</h1>
					<p className='text-gray-600'>あなたの水槽にログインしてください</p>
				</div>
				{authError && (
					<div className='mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm'>
						<strong>ログインエラー:</strong> {authError}
					</div>
				)}
				<div className='space-y-3'>
					<Button
						onClick={signInWithGoogle}
						className='w-full bg-blue-500 hover:bg-blue-600 text-white py-3 text-lg'
					>
						<FaGoogle className='mr-2' />
						Googleでログイン
					</Button>
				</div>
			</div>
		</div>
	);
}
