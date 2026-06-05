import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { join } from "path";

if (!getApps().length) {
  let credential;

  if (process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT) {
    // JSON 통째로 넣은 경우
    credential = cert(JSON.parse(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT));
  } else if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    // 필드 분리 방식 (현재 .env.local 및 Vercel 환경변수)
    credential = cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n").trim(),
    });
  } else {
    // 로컬 개발: JSON 파일 직접 읽기
    const keyPath = join(process.cwd(), "../mailer-worker/emailer-71608-firebase-adminsdk-fbsvc-b3eb7c9edf.json");
    credential = cert(JSON.parse(readFileSync(keyPath, "utf-8")));
  }

  initializeApp({ credential });
}

export const adminAuth = getAuth();
export const adminDb = getFirestore();

export async function assertAdmin(token: string): Promise<boolean> {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.isAdmin === true) return true;
  const mailEmail = (decoded.mailEmail as string | undefined) ?? decoded.email;
  if (!mailEmail) return false;
  const doc = await adminDb.collection("members").doc(mailEmail).get();
  return doc.exists && doc.data()?.isAdmin === true;
}
