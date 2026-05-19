import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { Resend } from "resend";

const USE_SMTP = process.env.MAIL_TRANSPORT === "smtp";

export async function POST(req: NextRequest) {
  const { id, name, email, password } = await req.json();

  if (USE_SMTP) {
    // SMTP 모드: id = 풀 이메일, tenants에 있으면 바로 Firebase Auth 계정 생성
    if (!id || !name || !password) {
      return NextResponse.json({ error: "필수 항목을 입력해주세요." }, { status: 400 });
    }
    const tenantDoc = await adminDb.collection("tenants").doc(id).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: "EmailArchiver가 먼저 실행되어야 합니다. (node auth.js)" }, { status: 400 });
    }
    try {
      await adminAuth.createUser({ email: id, password, displayName: name, disabled: false });
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "auth/email-already-exists") {
        return NextResponse.json({ error: "이미 등록된 계정입니다." }, { status: 400 });
      }
      throw e;
    }
    return NextResponse.json({ ok: true });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  if (!id || !name || !email || !password) {
    return NextResponse.json({ error: "필수 항목을 입력해주세요." }, { status: 400 });
  }

  const idRegex = /^[a-z0-9]{2,20}$/;
  if (!idRegex.test(id)) {
    return NextResponse.json({ error: "아이디는 영문 소문자/숫자 2~20자입니다." }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: "올바른 이메일 형식을 입력해주세요." }, { status: 400 });
  }

  const MAIL_DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr";
  const mailAddress = `${id}@${MAIL_DOMAIN}`;

  // 아이디 중복 확인 (신청 중 + 승인된 회원)
  const [existingRequest, existingMember] = await Promise.all([
    adminDb.collection("signup_requests").where("id", "==", id).limit(1).get(),
    adminDb.collection("members").where("id", "==", id).limit(1).get(),
  ]);

  if (!existingRequest.empty || !existingMember.empty) {
    return NextResponse.json({ error: "이미 신청된 아이디입니다." }, { status: 400 });
  }

  // Firebase Auth에 비활성 상태로 계정 생성 — password는 여기서만 처리, DB에 저장 안 함
  let uid: string;
  try {
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
      disabled: true,
    });
    uid = userRecord.uid;
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === "auth/email-already-exists") {
      return NextResponse.json({ error: "이미 사용 중인 이메일입니다." }, { status: 400 });
    }
    throw e;
  }

  // 가입 신청 저장 — password 필드 없음
  await adminDb.collection("signup_requests").add({
    id,
    name,
    email,
    uid,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  // 관리자 알림 메일 (실패해도 가입 신청은 완료)
  const adminEmail = process.env.ADMIN_EMAIL!;
  try {
    await resend.emails.send({
      from: `noreply@${MAIL_DOMAIN}`,
      to: adminEmail,
      subject: `[${MAIL_DOMAIN}] 가입 신청 — ${name} (${mailAddress})`,
      html: `<p><b>${name}</b>님이 <b>${mailAddress}</b> 계정 가입을 신청했습니다.</p><p>관리자 페이지에서 승인 또는 거절해 주세요.</p>`,
    });
  } catch (e) {
    console.error("관리자 알림 메일 발송 실패:", e);
  }

  return NextResponse.json({ ok: true });
}
