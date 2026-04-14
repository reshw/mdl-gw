import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { id, name, password } = await req.json();

  if (!id || !name || !password) {
    return NextResponse.json({ error: "필수 항목을 입력해주세요." }, { status: 400 });
  }

  const idRegex = /^[a-z0-9]{2,20}$/;
  if (!idRegex.test(id)) {
    return NextResponse.json({ error: "아이디는 영문 소문자/숫자 2~20자입니다." }, { status: 400 });
  }

  // 중복 확인
  const existing = await adminDb.collection("signup_requests")
    .where("id", "==", id)
    .limit(1)
    .get();

  if (!existing.empty) {
    return NextResponse.json({ error: "이미 신청된 아이디입니다." }, { status: 400 });
  }

  // 가입 신청 저장
  await adminDb.collection("signup_requests").add({
    id,
    name,
    password,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  // 관리자 알림 메일 발송 (실패해도 가입 신청은 완료)
  const MAIL_DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr";
  const adminEmail = process.env.ADMIN_EMAIL!;
  try {
    await resend.emails.send({
      from: `noreply@${MAIL_DOMAIN}`,
      to: adminEmail,
      subject: `[${MAIL_DOMAIN}] 가입 신청 — ${name} (${id}@${MAIL_DOMAIN})`,
      html: `<p><b>${name}</b>님이 <b>${id}@${MAIL_DOMAIN}</b> 계정 가입을 신청했습니다.</p><p>관리자 페이지에서 승인 또는 거절해 주세요.</p>`,
    });
  } catch (e) {
    console.error("관리자 알림 메일 발송 실패:", e);
  }

  return NextResponse.json({ ok: true });
}
