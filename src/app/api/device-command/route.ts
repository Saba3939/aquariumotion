import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey, getRealtimeDB } from '@/lib/firebase-server';

/**
 * デバイスコマンド取得API
 * GET /api/device-command?deviceId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    // API Key認証
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || !verifyApiKey(apiKey)) {
      return NextResponse.json({
        success: false,
        error: 'API認証が必要です'
      }, { status: 401 });
    }

    const url = new URL(request.url);
    const deviceId = url.searchParams.get('deviceId');

    if (!deviceId) {
      return NextResponse.json({
        success: false,
        error: 'deviceIdが必要です'
      }, { status: 400 });
    }

    const db = getRealtimeDB();
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'データベースに接続できません'
      }, { status: 500 });
    }

    // Firebase Realtime Databaseからコマンド取得
    const commandRef = db.ref(`device_commands/${deviceId}`);
    const snapshot = await commandRef.once('value');
    const commandData = snapshot.val();

    if (!commandData || commandData.processed) {
      return NextResponse.json({
        success: true,
        hasCommand: false
      });
    }

    // コマンドを処理済みにマーク
    await commandRef.update({ processed: true });

    return NextResponse.json({
      success: true,
      hasCommand: true,
      command: commandData.command,
      sessionId: commandData.sessionId,
      userId: commandData.userId,
      userName: commandData.userName
    });

  } catch (error) {
    console.error('Device command error:', error);
    return NextResponse.json({
      success: false,
      error: 'コマンド取得中にエラーが発生しました'
    }, { status: 500 });
  }
}