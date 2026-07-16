import { adminDb } from "@/lib/firebase-admin";
import { sendPushNotification } from "@/lib/push";

const NOTIFY_ENDPOINT = process.env.NOTIFY_ENDPOINT ?? "";
const NOTIFY_SECRET = process.env.NOTIFY_SECRET ?? "";
const MAIL_DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr";
const MAIL_LABEL = MAIL_DOMAIN.split(".")[0].toUpperCase(); // ourim.kr → OURIM, mdl.kr → MDL
const APP_URL = `https://gw.${MAIL_DOMAIN}`;

function buildHtml(from: string, subject: string, date: string): string {
  const time = new Date(date).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <!-- 프리헤더: 받은편지함 미리보기에 표시됨 -->
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(from)} — ${escapeHtml(subject)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;" cellpadding="0" cellspacing="0">

        <!-- 카드 -->
        <tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:28px 28px 24px;">

          <!-- 발신자 강조 -->
          <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#18181b;">${escapeHtml(from)}</p>
          <p style="margin:0 0 20px;font-size:14px;color:#52525b;">${escapeHtml(subject)}</p>

          <div style="border-top:1px solid #f4f4f5;padding-top:16px;">
            <span style="font-size:12px;color:#a1a1aa;">${time}</span>
          </div>

          <div style="margin-top:20px;text-align:center;">
            <a href="${APP_URL}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:13px;font-weight:500;padding:10px 28px;border-radius:8px;letter-spacing:.01em;">확인하기</a>
          </div>

        </td></tr>

        <!-- 푸터 -->
        <tr><td style="padding-top:16px;text-align:center;font-size:11px;color:#a1a1aa;">
          ${MAIL_DOMAIN} 메일 서비스
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function notify(
  recipientMailEmail: string,
  mail: { from: string; subject: string; date: string; mailId?: string; text?: string }
): Promise<void> {
  const memberDoc = await adminDb.collection("members").doc(recipientMailEmail).get();
  if (!memberDoc.exists) return;
  const member = memberDoc.data()!;

  await Promise.allSettled([
    sendEmailNotification(member, mail),
    sendPushNotification(recipientMailEmail, member, mail),
  ]);
}

async function sendEmailNotification(
  member: FirebaseFirestore.DocumentData,
  mail: { from: string; subject: string; date: string }
): Promise<void> {
  if (!NOTIFY_ENDPOINT || !NOTIFY_SECRET) return;
  if (member.notifications?.emailEnabled === false) return;

  const personalEmail: string = member.personalEmail ?? "";
  if (!personalEmail) return;

  const subject = `[${MAIL_LABEL}] ${mail.subject}`;
  const html = buildHtml(mail.from, mail.subject, mail.date);

  await fetch(NOTIFY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: personalEmail, subject, html, secret: NOTIFY_SECRET }),
  });
}
