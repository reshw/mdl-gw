import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getMessaging } from "firebase-admin/messaging";
import { getApps, initializeApp, cert } from "firebase-admin/app";

// 임시 진단용 — 확인 후 즉시 삭제할 것.
// 사용: GET /api/debugpushcheck?email=sky@scnd.kr
export async function GET(req: Request) {
  const email = new URL(req.url).searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email 쿼리 필요" }, { status: 400 });

  const doc = await adminDb.collection("members").doc(email).get();
  const tokens: string[] = doc.exists ? (doc.data()?.fcmTokens ?? []) : [];

  const pushEnvSet = !!process.env.FIREBASE_PUSH_SERVICE_ACCOUNT;
  let pushEnvParsed: { project_id?: string; client_email?: string } | { error: string } = {
    error: "env not set",
  };
  if (pushEnvSet) {
    try {
      const p = JSON.parse(process.env.FIREBASE_PUSH_SERVICE_ACCOUNT!);
      pushEnvParsed = { project_id: p.project_id, client_email: p.client_email };
    } catch (e) {
      pushEnvParsed = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  let sendResult: unknown = null;
  if (tokens.length > 0 && pushEnvSet) {
    try {
      const json = process.env.FIREBASE_PUSH_SERVICE_ACCOUNT!;
      const existing = getApps().find((a) => a.name === "push");
      const app = existing ?? initializeApp({ credential: cert(JSON.parse(json)) }, "push");
      const res = await getMessaging(app).sendEachForMulticast({
        tokens,
        data: { mailEmail: email, mailId: "debug" },
        apns: {
          payload: {
            aps: {
              alert: { title: email, subtitle: "서버 디버그", body: "진단 테스트" },
              sound: "default",
            },
          },
        },
      });
      sendResult = {
        successCount: res.successCount,
        failureCount: res.failureCount,
        responses: res.responses.map((r) => ({
          success: r.success,
          errorCode: r.error?.code,
          errorMessage: r.error?.message,
        })),
      };
    } catch (e) {
      sendResult = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({
    memberDocExists: doc.exists,
    notifications: doc.data()?.notifications ?? null,
    tokenCount: tokens.length,
    pushEnvSet,
    pushEnvParsed,
    sendResult,
  });
}
