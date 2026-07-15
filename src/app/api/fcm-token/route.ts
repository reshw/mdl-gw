import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

async function getEmail(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return (decoded.mailEmail as string) ?? decoded.email ?? null;
  } catch {
    return null;
  }
}

// iOS 앱 FCM 디바이스 토큰 등록/해제.
// members/{mailEmail}.fcmTokens 배열에 저장 — notify.ts의 push 발송이 이 배열을 읽는다.
export async function POST(req: NextRequest) {
  const email = await getEmail(req);
  if (!email) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { token, action } = await req.json();
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "token 필요" }, { status: 400 });
  }

  const update =
    action === "unregister"
      ? { fcmTokens: FieldValue.arrayRemove(token) }
      : { fcmTokens: FieldValue.arrayUnion(token), fcmTokensUpdatedAt: new Date().toISOString() };

  // 문서가 없으면(SMTP 모드 테넌트 등) merge로 생성 — push 발송 시 이 문서를 조회한다
  await adminDb.collection("members").doc(email).set(update, { merge: true });
  return NextResponse.json({ ok: true });
}
