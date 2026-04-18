// app/api/send-fcm/route.ts
import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

function ensureFirebaseApp() {
  if (admin.apps.length) return;
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export async function POST(req: Request) {
  try {
    ensureFirebaseApp();
    const { token, message } = await req.json();

    const payload = {
      token: token, // This is the unique ID of your phone
      notification: {
        title: 'Tumbler Notification',
        body: message,
      },
      android: {
        priority: 'high' as const,
      }
    };

    await admin.messaging().send(payload);

    // 5. STORE IN FIRESTORE (Optional "Database" part of request)
    try {
      const db = admin.firestore();
      await db.collection('notification_history').add({
        token: token,
        title: 'Tumbler Notification',
        body: message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        type: 'push'
      });
    } catch (dbError) {
      console.error("Firestore Log Failed:", dbError);
      // We don't fail the request if just the logging fails
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}