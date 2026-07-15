import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

// App Store 심사 가이드라인 5.1.1(v) 대응 — 앱 내 계정 삭제 요청 접수.
// 실제 삭제는 관리자가 account_delete_requests 컬렉션을 보고 수동 처리한다.
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  let mailEmail: string;
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    mailEmail = (decoded.mailEmail as string) ?? decoded.email ?? "";
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
  }
  if (!mailEmail) return NextResponse.json({ error: "계정 정보 없음" }, { status: 400 });

  await adminDb.collection("account_delete_requests").doc(mailEmail).set({
    mailEmail,
    uid,
    status: "pending",
    requestedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
