import * as admin from "firebase-admin";
import { DecodedIdToken } from "firebase-admin/auth";

let firebaseInitialized = false;

// サービスアカウント設定を安全に取得
function getServiceAccount() {
	const serviceAccountEnv = process.env.GOOGLE_SERVICE_ACCOUNT;
	
	if (!serviceAccountEnv) {
		console.error('GOOGLE_SERVICE_ACCOUNT environment variable not set');
		return null;
	}

	try {
		const serviceAccount = JSON.parse(serviceAccountEnv);
		
		// 必須フィールドの確認
		if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
			console.error('Service account missing required fields');
			return null;
		}
		
		return serviceAccount;
	} catch (error) {
		console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT:', error);
		return null;
	}
}

// Firebase Admin初期化（遅延初期化）
function initializeFirebaseAdmin() {
	if (firebaseInitialized || admin.apps.length > 0) {
		return true;
	}

	const serviceAccount = getServiceAccount();
	
	if (!serviceAccount) {
		console.warn('Firebase Admin SDK not initialized - service account not available');
		return false;
	}

	try {
		admin.initializeApp({
			credential: admin.credential.cert(serviceAccount),
		});
		firebaseInitialized = true;
		return true;
	} catch (error) {
		console.error('Failed to initialize Firebase Admin SDK:', error);
		return false;
	}
}

// 安全にFirestore/Authインスタンスを取得（遅延初期化付き）
function getFirestoreInstance() {
	if (!initializeFirebaseAdmin()) {
		return null;
	}
	
	try {
		return admin.firestore();
	} catch (error) {
		console.error('Failed to get Firestore instance:', error);
		return null;
	}
}

function getAuthInstance() {
	if (!initializeFirebaseAdmin()) {
		return null;
	}
	
	try {
		return admin.auth();
	} catch (error) {
		console.error('Failed to get Auth instance:', error);
		return null;
	}
}

// 実行時に取得する関数として export
export function getDB() {
	return getFirestoreInstance();
}

export function getAuth() {
	return getAuthInstance();
}

// IDトークン検証関数
export async function verifyIdToken(idToken: string): Promise<DecodedIdToken | null> {
	const auth = getAuthInstance();
	if (!auth) {
		console.error('Auth instance not available');
		return null;
	}
	
	try {
		const decodedToken = await auth.verifyIdToken(idToken);
		return decodedToken;
	} catch (error) {
		console.error('ID token verification failed:', error);
		return null;
	}
}

// API-KEY認証関数
export function verifyApiKey(apiKey: string): boolean {
	const validApiKey = process.env.ESP32_API_KEY;
	return Boolean(validApiKey && apiKey === validApiKey);
}

// 後方互換性のため（動的に取得）
export { admin };
