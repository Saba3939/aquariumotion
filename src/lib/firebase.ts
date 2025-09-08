// Import the functions you need from the SDKs you need
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
	apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyD-eg6zqjXKuxisGkevAQy37h4hbpKG8SI",
	authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "kosenprocon2025.firebaseapp.com",
	projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "kosenprocon2025",
	storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "kosenprocon2025.firebasestorage.app",
	messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "899830984318",
	appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:899830984318:web:d30fe588025e17811d722f",
};;

// クライアントサイドでのみ初期化
let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

function initializeFirebase() {
	if (typeof window === 'undefined') {
		// サーバーサイドでは何もしない
		return null;
	}

	if (!app) {
		try {
			console.log('Firebase初期化開始');
			console.log('Firebase設定:', {
				apiKey: firebaseConfig.apiKey ? '設定済み' : '未設定',
				authDomain: firebaseConfig.authDomain,
				projectId: firebaseConfig.projectId,
				appId: firebaseConfig.appId ? '設定済み' : '未設定'
			});
			
			// 必須設定の確認
			if (!firebaseConfig.apiKey) {
				throw new Error('NEXT_PUBLIC_FIREBASE_API_KEYが設定されていません');
			}
			if (!firebaseConfig.authDomain) {
				throw new Error('NEXT_PUBLIC_FIREBASE_AUTH_DOMAINが設定されていません');
			}
			if (!firebaseConfig.projectId) {
				throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_IDが設定されていません');
			}
			
			app = initializeApp(firebaseConfig);
			db = getFirestore(app);
			auth = getAuth(app);
			
			googleProvider = new GoogleAuthProvider();
			
			// Vercelドメインのための設定
			googleProvider.setCustomParameters({
				prompt: 'select_account',
				hd: '*' // すべてのドメインを許可
			});
			
			console.log('Firebase初期化成功 - Project ID:', firebaseConfig.projectId);
		} catch (error) {
			console.error('Firebase初期化エラー:', error);
			app = null;
			db = null;
			auth = null;
			googleProvider = null;
			return null;
		}
	}

	return { app, db, auth, googleProvider };
}

// Getter関数でクライアントサイドでのみ初期化
export function getFirebaseAuth() {
	const firebase = initializeFirebase();
	return firebase?.auth || null;
}

export function getFirebaseDB() {
	const firebase = initializeFirebase();
	return firebase?.db || null;
}

export function getGoogleProvider() {
	const firebase = initializeFirebase();
	return firebase?.googleProvider || null;
}

export default app;
