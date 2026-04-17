import { adminDb } from "@/lib/firebase-admin";

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
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;" cellpadding="0" cellspacing="0">

        <!-- 헤더 -->
        <tr><td style="padding-bottom:16px;">
          <span style="font-size:13px;font-weight:600;color:#71717a;letter-spacing:.05em;">${MAIL_DOMAIN.toUpperCase()}</span>
        </td></tr>

        <!-- 카드 -->
        <tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:28px 28px 24px;">

          <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#18181b;">새 메일이 도착했습니다</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f4f4f5;">
            <tr>
              <td style="padding:12px 0;border-bottom:1px solid #f4f4f5;width:72px;font-size:12px;font-weight:500;color:#a1a1aa;vertical-align:top;">발신자</td>
              <td style="padding:12px 0;border-bottom:1px solid #f4f4f5;font-size:13px;color:#18181b;">${escapeHtml(from)}</td>
            </tr>
            <tr>
              <td style="padding:12px 0;border-bottom:1px solid #f4f4f5;font-size:12px;font-weight:500;color:#a1a1aa;vertical-align:top;">제목</td>
              <td style="padding:12px 0;border-bottom:1px solid #f4f4f5;font-size:13px;color:#18181b;">${escapeHtml(subject)}</td>
            </tr>
            <tr>
              <td style="padding:12px 0;font-size:12px;font-weight:500;color:#a1a1aa;vertical-align:top;">시간</td>
              <td style="padding:12px 0;font-size:13px;color:#71717a;">${time}</td>
            </tr>
          </table>

          <div style="margin-top:24px;text-align:center;">
            <a href="${APP_URL}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:13px;font-weight:500;padding:10px 28px;border-radius:8px;letter-spacing:.01em;">${APP_URL}에서 확인하기</a>
          </div>

        </td></tr>

        <!-- 푸터 -->
        <tr><td style="padding-top:16px;text-align:center;font-size:11px;color:#a1a1aa;">
          이 알림은 ${MAIL_DOMAIN} 메일 서비스에서 발송되었습니다.
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
  mail: { from: string; subject: string; date: string }
): Promise<void> {
  console.log("[notify] start", { recipientMailEmail, endpoint: NOTIFY_ENDPOINT ? "set" : "missing", secret: NOTIFY_SECRET ? "set" : "missing" });
  if (!NOTIFY_ENDPOINT || !NOTIFY_SECRET) return;

  const memberDoc = await adminDb.collection("members").doc(recipientMailEmail).get();
  console.log("[notify] memberDoc.exists:", memberDoc.exists);
  if (!memberDoc.exists) return;

  const member = memberDoc.data()!;
  const emailEnabled = member.notifications?.emailEnabled;
  console.log("[notify] emailEnabled:", emailEnabled, "personalEmail:", member.personalEmail);
  if (emailEnabled === false) return;

  const personalEmail: string = member.personalEmail ?? "";
  if (!personalEmail) return;

  const subject = `[${MAIL_LABEL}] ${mail.subject}`;
  const html = buildHtml(mail.from, mail.subject, mail.date);

  console.log("[notify] fetching endpoint for:", personalEmail);
  const res = await fetch(NOTIFY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: personalEmail, subject, html, secret: NOTIFY_SECRET }),
  });
  console.log("[notify] endpoint response:", res.status, res.statusText);
}
