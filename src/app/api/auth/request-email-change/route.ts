import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { Resend } from "resend";
import { FieldValue } from "firebase-admin/firestore";

const MAIL_DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr";
const MAIL_LABEL = MAIL_DOMAIN.split(".")[0].toUpperCase();

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY);
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

  const { newEmail, currentPassword } = await req.json();
  if (!newEmail || !currentPassword) {
    return NextResponse.json({ error: "새 이메일과 현재 비밀번호를 입력해주세요." }, { status: 400 });
  }

  // 이메일 형식 검사
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return NextResponse.json({ error: "올바른 이메일 형식이 아닙니다." }, { status: 400 });
  }

  // 현재 personalEmail 조회
  const memberDoc = await adminDb.collection("members").doc(mailEmail).get();
  const personalEmail = memberDoc.data()?.personalEmail;
  if (!personalEmail) {
    return NextResponse.json({ error: "계정 정보를 찾을 수 없습니다." }, { status: 400 });
  }

  // 같은 이메일로 변경 시도 체크
  if (newEmail.toLowerCase() === personalEmail.toLowerCase()) {
    return NextResponse.json({ error: "현재 사용 중인 이메일과 동일합니다." }, { status: 400 });
  }

  // 현재 비밀번호 검증 (Firebase REST API)
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

  // 새 이메일 중복 체크
  try {
    await adminAuth.getUserByEmail(newEmail);
    return NextResponse.json({ error: "이미 사용 중인 이메일입니다." }, { status: 409 });
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== "auth/user-not-found") {
      return NextResponse.json({ error: "이메일 확인 중 오류가 발생했습니다." }, { status: 500 });
    }
    // user-not-found → 사용 가능
  }

  // 6자리 OTP 생성
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10분 후

  // Firestore에 저장
  await adminDb.collection("email_change_requests").doc(uid).set({
    uid,
    mailEmail,
    newPersonalEmail: newEmail,
    otp,
    expiresAt: FieldValue.serverTimestamp(),
    expiresAtMs: expiresAt.getTime(),
    createdAt: FieldValue.serverTimestamp(),
  });

  // OTP 이메일 발송
  await resend.emails.send({
    from: `noreply@${MAIL_DOMAIN}`,
    to: newEmail,
    subject: `[${MAIL_LABEL}] 이메일 변경 인증 코드`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:400px;margin:40px auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
        <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#18181b;">${MAIL_LABEL} 메일 이메일 변경 인증</p>
        <p style="margin:0 0 24px;font-size:13px;color:#71717a;">아래 인증 코드를 입력해주세요.</p>
        <div style="background:#f4f4f5;border-radius:8px;padding:16px;text-align:center;letter-spacing:8px;font-size:28px;font-weight:700;color:#18181b;">${otp}</div>
        <p style="margin:20px 0 0;font-size:12px;color:#a1a1aa;">10분 이내에 입력해야 합니다. 본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
      </div>
    `,
  });

  return NextResponse.json({ ok: true });
}
