import * as admin from "firebase-admin";
import { DecodedIdToken } from "firebase-admin/auth";

const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT ?? "{}");

if (!admin.apps.length) {
	admin.initializeApp({
		credential: admin.credential.cert(serviceAccount),
	});
}

const db = admin.firestore();
const auth = admin.auth();

// IDトークン検証関数
export async function verifyIdToken(idToken: string): Promise<DecodedIdToken | null> {
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

export { db, admin, auth };
