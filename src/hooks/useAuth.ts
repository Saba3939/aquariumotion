import { useState, useEffect, useCallback } from "react";
import {
	signOut,
	onAuthStateChanged,
	getRedirectResult,
	signInWithPopup,
	type User as FirebaseUser,
} from "firebase/auth";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebase";

export const useAuth = () => {
	const [user, setUser] = useState<FirebaseUser | null>(null);
	const [authLoading, setAuthLoading] = useState(true);
	const [authError, setAuthError] = useState<string | null>(null);

	useEffect(() => {
		const auth = getFirebaseAuth();
		if (!auth) {
			console.error('Firebaseの初期化に失敗しました');
			setAuthLoading(false);
			return;
		}

		const unsubscribe = onAuthStateChanged(auth, (user) => {
			setUser(user);
			setAuthLoading(false);
		});

		getRedirectResult(auth)
			.then((result) => {
				if (result) {
					setUser(result.user);
					setAuthLoading(false);
				}
			})
			.catch((error) => {
				setAuthError(`認証エラー: ${error.message}`);
				setAuthLoading(false);
			});

		return () => unsubscribe();
	}, []);

	const signInWithGooglePopup = useCallback(async () => {
		setAuthError(null);
		setAuthLoading(true);

		const auth = getFirebaseAuth();
		const provider = getGoogleProvider();

		if (!auth) {
			setAuthError('Firebase認証の初期化に失敗しました');
			setAuthLoading(false);
			return;
		}

		if (!provider) {
			setAuthError('Googleプロバイダーの初期化に失敗しました');
			setAuthLoading(false);
			return;
		}

		try {
			const result = await signInWithPopup(auth, provider);

			if (!result) {
				throw new Error('認証結果がnullまたはundefinedです');
			}

			if (!result.user) {
				throw new Error('ユーザー情報が取得できませんでした');
			}

			setUser(result.user);
			setAuthLoading(false);
		} catch (error: unknown) {
			const errorCode = (error as { code?: string })?.code;
			const errorMsg = (error as { message?: string })?.message;

			let userFriendlyMessage = '';
			if (errorCode === 'auth/popup-closed-by-user') {
				userFriendlyMessage = 'ポップアップがユーザーによって閉じられました';
			} else if (errorCode === 'auth/popup-blocked') {
				userFriendlyMessage = 'ポップアップがブロックされました。ブラウザの設定を確認してください';
			} else if (errorCode === 'auth/unauthorized-domain') {
				userFriendlyMessage = 'このドメイン（' + window.location.hostname + '）は認証が許可されていません';
			} else if (errorCode === 'auth/operation-not-allowed') {
				userFriendlyMessage = 'Google認証が有効になっていません';
			} else {
				userFriendlyMessage = `ポップアップログインエラー: ${errorCode || 'unknown'} - ${errorMsg || 'undefined error'}`;
			}

			setAuthError(userFriendlyMessage);
			setAuthLoading(false);
		}
	}, []);

	const signInWithGoogleRedirect = useCallback(async () => {
		setAuthError(null);
		setAuthLoading(true);

		const auth = getFirebaseAuth();
		const provider = getGoogleProvider();

		if (!auth || !provider) {
			setAuthError('Firebase認証の初期化に失敗しました');
			setAuthLoading(false);
			return;
		}

		try {
			const { signInWithRedirect } = await import('firebase/auth');
			await signInWithRedirect(auth, provider);
		} catch (error: unknown) {
			const errorCode = (error as { code?: string })?.code;
			const errorMsg = (error as { message?: string })?.message;
			setAuthError(`リダイレクトログインエラー: ${errorCode} - ${errorMsg}`);
			setAuthLoading(false);
		}
	}, []);

	const signInWithGoogle = signInWithGooglePopup;

	const handleSignOut = useCallback(async () => {
		const auth = getFirebaseAuth();
		if (!auth) {
			console.error("Firebase認証が利用できません");
			return;
		}

		try {
			await signOut(auth);
		} catch (error) {
			console.error("ログアウトに失敗しました:", error);
		}
	}, []);

	return {
		user,
		authLoading,
		authError,
		signInWithGoogle,
		signInWithGooglePopup,
		signInWithGoogleRedirect,
		handleSignOut,
	};
};;