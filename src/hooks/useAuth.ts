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

	// 認証状態の監視
	useEffect(() => {
		console.log('=== 認証初期化開始 ===');
		console.log('現在のドメイン:', window.location.hostname);
		console.log('URL:', window.location.href);
		console.log('Firebase設定:');
		console.log('- API Key:', process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '設定済み' : '未設定');
		console.log('- Auth Domain:', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
		console.log('- Project ID:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

		const auth = getFirebaseAuth();
		if (!auth) {
			console.error('Firebase認証の初期化に失敗しました');
			setAuthLoading(false);
			return;
		}

		console.log('Firebase認証初期化成功');

		// 認証状態の監視を開始
		const unsubscribe = onAuthStateChanged(auth, (user) => {
			console.log('=== 認証状態変更 ===');
			console.log('user:', user);
			console.log('ログイン状態:', user ? 'ログイン済み' : '未ログイン');
			if (user) {
				console.log('UID:', user.uid);
				console.log('メール:', user.email);
				console.log('表示名:', user.displayName);
				console.log('写真URL:', user.photoURL);
			}
			setUser(user);
			setAuthLoading(false);
		});

		// リダイレクト認証の結果をチェック
		getRedirectResult(auth)
			.then((result) => {
				console.log('=== リダイレクト結果 ===');
				console.log('result:', result);
				if (result) {
					console.log("✅ リダイレクト認証成功");
					console.log("ユーザー:", result.user);
					console.log("UID:", result.user.uid);
					console.log("メール:", result.user.email);
					console.log("表示名:", result.user.displayName);
					// 明示的にユーザーを設定
					setUser(result.user);
					setAuthLoading(false);
				} else {
					console.log("ℹ️ リダイレクト認証なし（通常のページロード）");
				}
			})
			.catch((error) => {
				console.log('=== リダイレクト認証エラー ===');
				console.error("エラー詳細:", error);
				console.error("エラーコード:", error?.code);
				console.error("エラーメッセージ:", error?.message);
				setAuthError(`認証エラー: ${error.message}`);
				setAuthLoading(false);
			});

		return () => unsubscribe();
	}, []);

	// ポップアップでログイン
	const signInWithGooglePopup = useCallback(async () => {
		console.log('=== ポップアップログイン開始 ===');
		setAuthError(null);
		setAuthLoading(true);

		const auth = getFirebaseAuth();
		const provider = getGoogleProvider();

		if (!auth) {
			console.error('Firebase Auth初期化失敗');
			setAuthError('Firebase認証の初期化に失敗しました');
			setAuthLoading(false);
			return;
		}

		if (!provider) {
			console.error('Google Provider初期化失敗');
			setAuthError('Googleプロバイダーの初期化に失敗しました');
			setAuthLoading(false);
			return;
		}

		try {
			console.log('Firebase認証状況:', {
				authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
				apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '設定済み' : '未設定',
				currentDomain: window.location.hostname,
				currentOrigin: window.location.origin
			});

			console.log('ポップアップ認証実行中...');
			const result = await signInWithPopup(auth, provider);

			if (!result) {
				throw new Error('認証結果がnullまたはundefinedです');
			}

			if (!result.user) {
				throw new Error('ユーザー情報が取得できませんでした');
			}

			console.log('✅ ポップアップ認証成功:', {
				email: result.user.email,
				uid: result.user.uid,
				displayName: result.user.displayName,
				photoURL: result.user.photoURL
			});

			setUser(result.user);
			setAuthLoading(false);
		} catch (error: unknown) {
			console.error('ポップアップ認証エラー:', error);
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

	// リダイレクトでログイン
	const signInWithGoogleRedirect = useCallback(async () => {
		console.log('=== リダイレクトログイン開始 ===');
		setAuthError(null);
		setAuthLoading(true);

		const auth = getFirebaseAuth();
		const provider = getGoogleProvider();

		if (!auth || !provider) {
			console.error('Firebase初期化失敗');
			setAuthError('Firebase認証の初期化に失敗しました');
			setAuthLoading(false);
			return;
		}

		try {
			const { signInWithRedirect } = await import('firebase/auth');
			console.log('リダイレクト認証実行中...');
			console.log('認証ドメイン:', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
			console.log('現在のドメイン:', window.location.hostname);
			await signInWithRedirect(auth, provider);
		} catch (error: unknown) {
			console.error('リダイレクト認証エラー:', error);
			const errorCode = (error as { code?: string })?.code;
			const errorMsg = (error as { message?: string })?.message;
			setAuthError(`リダイレクトログインエラー: ${errorCode} - ${errorMsg}`);
			setAuthLoading(false);
		}
	}, []);

	// デフォルトはポップアップを使用
	const signInWithGoogle = signInWithGooglePopup;

	// ログアウト
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
};