import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  let uid: string;
  let mailEmail: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
    mailEmail = decoded.mailEmail as string;
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
  }

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "현재 비밀번호와 새 비밀번호를 입력해주세요." }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "새 비밀번호는 6자 이상이어야 합니다." }, { status: 400 });
  }

  // members에서 personalEmail 조회
  const doc = await adminDb.collection("members").doc(mailEmail).get();
  const personalEmail = doc.data()?.personalEmail;
  if (!personalEmail) {
    return NextResponse.json({ error: "계정 정보를 찾을 수 없습니다." }, { status: 400 });
  }

  // 현재 비밀번호 검증
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const verify = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: personalEmail, password: currentPassword, returnSecureToken: false }),
    }
  );
  const verifyBody = await verify.json();
  if (verifyBody.error) {
    return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  await adminAuth.updateUser(uid, { password: newPassword });
  // IMAP 비번을 Mailer 비번과 동기화
  await adminDb.collection("tenants").doc(mailEmail).set({ imap_pass: newPassword }, { merge: true });
  return NextResponse.json({ ok: true });
}
