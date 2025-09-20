import { Button } from "@/components/ui/button";

interface LoginScreenProps {
	authError: string | null;
	signInWithGoogle: () => Promise<void>;
	signInWithGoogleRedirect: () => Promise<void>;
}

export default function LoginScreen({
	authError,
	signInWithGoogle,
	signInWithGoogleRedirect
}: LoginScreenProps) {
	return (
		<div className='min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center'>
			<div className='bg-white rounded-2xl shadow-lg p-8 max-w-md w-full mx-4'>
				<div className='text-center mb-8'>
					<div className='text-6xl mb-4'>🐠</div>
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
				<details className='mb-4 text-xs text-gray-500'>
					<summary className='cursor-pointer hover:text-gray-700'>🔍 Firebase設定状況を確認</summary>
					<div className='mt-2 p-2 bg-gray-100 rounded text-left'>
						<p className='font-semibold mb-2'>Firebase設定状況:</p>
						<ul className='list-disc list-inside space-y-1'>
							<li>API Key: {process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '✅設定済み' : '❌未設定'}</li>
							<li>Auth Domain: {process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? '✅設定済み' : '❌未設定'}
								{process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN && <span className='text-gray-400'>({process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN})</span>}
							</li>
							<li>Project ID: {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? '✅設定済み' : '❌未設定'}
								{process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && <span className='text-gray-400'>({process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID})</span>}
							</li>
							<li>Storage Bucket: {process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? '✅設定済み' : '❌未設定'}</li>
							<li>Messaging Sender ID: {process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ? '✅設定済み' : '❌未設定'}</li>
							<li>App ID: {process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? '✅設定済み' : '❌未設定'}</li>
						</ul>
						<div className='mt-2 pt-2 border-t border-gray-300'>
							<p className='font-semibold mb-1'>環境情報:</p>
							<ul className='list-disc list-inside space-y-1'>
								<li>現在のドメイン: <span className='text-gray-600'>{typeof window !== 'undefined' ? window.location.hostname : 'server'}</span></li>
								<li>現在のURL: <span className='text-gray-600'>{typeof window !== 'undefined' ? window.location.origin : 'server'}</span></li>
								<li>Node環境: <span className='text-gray-600'>{process.env.NODE_ENV || 'unknown'}</span></li>
							</ul>
						</div>
						<div className='mt-2 pt-2 border-t border-gray-300'>
							<p className='font-semibold mb-1'>⚠️ Firebase認証が失敗する場合:</p>
							<ol className='list-decimal list-inside space-y-1 text-gray-700'>
								<li>Firebase Consoleで認証済みドメインに以下を追加:
									<ul className='ml-4 mt-1'>
										<li>• aquariumotion.vercel.app</li>
										<li>• *.vercel.app</li>
									</ul>
								</li>
								<li>Google認証プロバイダーが有効になっているか確認</li>
							</ol>
						</div>
					</div>
				</details>
				<div className='space-y-3'>
					<Button
						onClick={signInWithGoogle}
						className='w-full bg-blue-500 hover:bg-blue-600 text-white py-3 text-lg'
					>
						Googleでログイン（ポップアップ）
					</Button>
					<Button
						onClick={signInWithGoogleRedirect}
						variant='outline'
						className='w-full border-blue-500 text-blue-500 hover:bg-blue-50 py-3 text-lg'
					>
						Googleでログイン（リダイレクト）
					</Button>
					<p className='text-xs text-gray-500 text-center'>
						ポップアップがブロックされる場合はリダイレクトをお試しください
					</p>
				</div>
			</div>
		</div>
	);
}