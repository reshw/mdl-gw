import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth } from "@/lib/firebase-admin";

const resend = new Resend(process.env.RESEND_API_KEY);
const PROJECT_ID = "emailer-71608";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  let fromEmail: string;
  let fromName: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    fromEmail = decoded.email ?? "";
    fromName = decoded.name ?? "";
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
  }

  if (!fromEmail.endsWith("@mdl.kr") && fromEmail !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { to, cc, bcc, subject, text, html, attachments } = await req.json();
  const attachmentNames = (attachments ?? []).map((a: { filename: string }) => a.filename);
  if (!to || !subject) return NextResponse.json({ error: "받는 사람과 제목을 입력해주세요." }, { status: 400 });

  // Resend로 발송
  const { error } = await resend.emails.send({
    from: fromEmail.endsWith("@mdl.kr")
      ? (fromName ? `${fromName} <${fromEmail}>` : fromEmail)
      : `noreply@mdl.kr`,
    to,
    ...(cc ? { cc } : {}),
    ...(bcc ? { bcc } : {}),
    subject,
    text: text ?? "",
    html: html ?? text ?? "",
    attachments: attachments ?? [],
  });

  const toStr = Array.isArray(to) ? to.join(", ") : to;
  const ccStr = cc ? (Array.isArray(cc) ? cc.join(", ") : cc) : undefined;

  if (error) {
    return NextResponse.json({
      ok: true,
      sentMail: {
        to: toStr,
        ...(ccStr ? { cc: ccStr } : {}),
        from: fromEmail,
        subject,
        text: text ?? "",
        html: html ?? text ?? "",
        attachmentNames,
        failed: true,
        failReason: error.message,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    sentMail: {
      to: toStr,
      ...(ccStr ? { cc: ccStr } : {}),
      from: fromEmail,
      subject,
      text: text ?? "",
      html: html ?? text ?? "",
      attachmentNames,
    },
  });
}
