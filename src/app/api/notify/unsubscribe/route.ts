import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";

const MAIL_DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr";

// 알림메일 하단 "알림 수신거부" 링크가 도달하는 엔드포인트.
// GET은 확인 페이지만 보여주고(메일 클라이언트의 링크 프리페치로 인한 오해제 방지),
// 실제 해제는 확인 버튼의 POST에서 수행한다.

function page(title: string, body: string, status = 200): Response {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:64px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:420px;" cellpadding="0" cellspacing="0">
        <tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:32px 28px;text-align:center;">
          ${body}
        </td></tr>
        <tr><td style="padding-top:16px;text-align:center;font-size:11px;color:#a1a1aa;">
          ${MAIL_DOMAIN} 메일 서비스
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function invalidPage(): Response {
  return page(
    "잘못된 링크",
    `<p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#18181b;">잘못된 링크입니다</p>
     <p style="margin:0;font-size:13px;color:#52525b;">링크가 손상되었거나 유효하지 않습니다.<br>최근에 받은 알림메일의 링크를 다시 이용해주세요.</p>`,
    400
  );
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const mailEmail = verifyUnsubscribeToken(token);
  if (!mailEmail) return invalidPage();

  return page(
    "알림 수신거부",
    `<p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#18181b;">이메일 알림을 해제할까요?</p>
     <p style="margin:0 0 24px;font-size:13px;color:#52525b;"><strong>${mailEmail}</strong> 계정의 새 메일 수신 알림이<br>더 이상 이 이메일로 발송되지 않습니다.</p>
     <form method="post" style="margin:0;">
       <input type="hidden" name="token" value="${token.replace(/"/g, "&quot;")}">
       <button type="submit" style="display:inline-block;background:#18181b;color:#ffffff;border:0;cursor:pointer;font-size:13px;font-weight:500;padding:10px 28px;border-radius:8px;">알림 수신거부</button>
     </form>
     <p style="margin:16px 0 0;font-size:11px;color:#a1a1aa;">나중에 다시 받으려면 웹메일 설정 → 알림에서 켤 수 있습니다.</p>`
  );
}

export async function POST(req: NextRequest) {
  let token = "";
  try {
    const form = await req.formData();
    token = String(form.get("token") ?? "");
  } catch {
    return invalidPage();
  }
  const mailEmail = verifyUnsubscribeToken(token);
  if (!mailEmail) return invalidPage();

  await adminDb
    .collection("members")
    .doc(mailEmail)
    .set({ notifications: { emailEnabled: false } }, { merge: true });

  return page(
    "수신거부 완료",
    `<p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#18181b;">이메일 알림이 해제되었습니다</p>
     <p style="margin:0 0 24px;font-size:13px;color:#52525b;"><strong>${mailEmail}</strong> 계정의 새 메일 알림이<br>더 이상 발송되지 않습니다.</p>
     <a href="/settings" style="display:inline-block;background:#f4f4f5;color:#18181b;text-decoration:none;font-size:13px;font-weight:500;padding:10px 28px;border-radius:8px;">알림 설정 열기</a>`
  );
}
