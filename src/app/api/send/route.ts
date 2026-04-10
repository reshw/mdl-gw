import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const resend = new Resend(process.env.RESEND_API_KEY);

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
  if (!to || !subject) return NextResponse.json({ error: "받는 사람과 제목을 입력해주세요." }, { status: 400 });

  const toList: string[] = Array.isArray(to) ? to : [to];
  const ccList: string[] = cc ? (Array.isArray(cc) ? cc : [cc]) : [];
  const toStr = toList.join(", ");
  const ccStr = ccList.length > 0 ? ccList.join(", ") : undefined;
  const attachmentNames = (attachments ?? []).map((a: { filename: string }) => a.filename);

  const from = fromEmail.endsWith("@mdl.kr")
    ? (fromName ? `${fromName} <${fromEmail}>` : fromEmail)
    : "noreply@mdl.kr";

  // 트래킹 픽셀 베이스 URL
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const baseUrl = `${proto}://${host}`;

  const sentAt = new Date().toISOString();
  const trackIds: Record<string, string> = {};

  // To 수신자별 개별 발송 + 픽셀 삽입
  for (const recipient of toList) {
    const trackId = crypto.randomUUID();
    trackIds[recipient] = trackId;

    const pixel = `<img src="${baseUrl}/api/track?id=${trackId}" width="1" height="1" style="display:none;border:0;" alt="" />`;
    const trackedHtml = (html ?? text ?? "") + pixel;

    // Firestore에 트래킹 문서 생성
    await adminDb.collection("tracking").doc(trackId).set({
      recipient,
      sentAt,
      openedAt: null,
    });

    await resend.emails.send({
      from,
      to: [recipient],
      // 전체 수신자 목록을 To 헤더에 표시 (수신자 눈에는 그룹메일처럼 보임)
      headers: toList.length > 1 ? { "To": toStr } : undefined,
      ...(ccStr ? { cc: ccStr } : {}),
      ...(bcc ? { bcc: Array.isArray(bcc) ? bcc.join(", ") : bcc } : {}),
      subject,
      text: text ?? "",
      html: trackedHtml,
      attachments: attachments ?? [],
    });
  }

  // CC 수신자는 첫 번째 발송에 포함됐으므로 별도 처리 불필요
  // (CC는 각 To 수신자 메일에 함께 들어감)

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
      trackIds,
    },
  });
}
