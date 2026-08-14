import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { notify } from "@/lib/notify";
import { s3Put, DEFAULT_BUCKET } from "@/lib/attachment-storage";

const USE_SMTP = process.env.MAIL_TRANSPORT === "smtp";

async function uploadAttachmentsForRecipient(
  recipient: string,
  mailId: string,
  attachments: { filename?: string; content?: string; content_type?: string }[]
): Promise<{ name: string; contentType: string; size: number; r2Key: string }[]> {
  const results = await Promise.all(
    attachments.map(async (att) => {
      const filename = att.filename ?? "attachment";
      const contentType = att.content_type ?? "application/octet-stream";
      if (!att.content) return null;
      const body = Uint8Array.from(atob(att.content), (c) => c.charCodeAt(0));
      const key = `${recipient}/${mailId}/${filename}`;
      await s3Put(key, body, contentType);
      return { name: filename, contentType, size: body.byteLength, r2Key: key };
    })
  );
  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}

// 수신자는 "표시이름 <addr@example.com>" 형태로도 들어온다(연락처에 이름이 있으면 UI가 이렇게
// 만든다). 이 문자열은 ">"로 끝나므로 그대로 도메인을 검사하면 내부 주소가 외부로 분류돼
// Resend를 타고 나갔다가 수신 워커에 다시 저장돼 중복된다. 판정·저장 키는 항상 순수 주소로 한다.
function bareAddress(raw: string): string {
  const match = raw.match(/^"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return (match ? match[2] : raw).trim();
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  let fromEmail: string;
  let fromName: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    fromEmail = (decoded.mailEmail as string) ?? decoded.email ?? "";
    fromName = decoded.name ?? "";
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
  }

  const resend = USE_SMTP ? null : new Resend(process.env.RESEND_API_KEY);
  const MAIL_DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr";
  if (!USE_SMTP && !fromEmail.endsWith(`@${MAIL_DOMAIN}`)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { to, cc, bcc, subject, text, html, attachments } = await req.json();
  if (!to || !subject) return NextResponse.json({ error: "받는 사람과 제목을 입력해주세요." }, { status: 400 });

  // 스토리지 env var 사전 체크 — 호스트는 CLOUDFLARE_ACCOUNT_ID(R2) 또는 S3_ENDPOINT_HOST(그 외 S3
  // 호환 공급자) 둘 중 하나만 있으면 된다.
  if (attachments?.length && (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || (!process.env.CLOUDFLARE_ACCOUNT_ID && !process.env.S3_ENDPOINT_HOST))) {
    const missing = ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].filter(k => !process.env[k]);
    if (!process.env.CLOUDFLARE_ACCOUNT_ID && !process.env.S3_ENDPOINT_HOST) missing.push("CLOUDFLARE_ACCOUNT_ID 또는 S3_ENDPOINT_HOST");
    return NextResponse.json({ error: `서버 설정 오류: 환경변수 누락 — ${missing.join(", ")}` }, { status: 500 });
  }

  try {
    const toList: string[] = Array.isArray(to) ? to : [to];
    const ccList: string[] = cc ? (Array.isArray(cc) ? cc : [cc]) : [];
    const bccList: string[] = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [];
    const toStr = toList.join(", ");
    const ccStr = ccList.length > 0 ? ccList.join(", ") : undefined;
    // BCC는 발신자 본인의 보낸편지함 기록에만 남긴다. 수신자 사본에 넣으면 숨은참조가 아니게 된다.
    const bccStr = bccList.length > 0 ? bccList.join(", ") : undefined;
    const attachmentNames = (attachments ?? []).map((a: { filename: string }) => a.filename);

    const from = USE_SMTP
      ? (fromName ? `${fromName} <${fromEmail}>` : fromEmail)
      : fromEmail.endsWith(`@${MAIL_DOMAIN}`)
        ? (fromName ? `${fromName} <${fromEmail}>` : fromEmail)
        : `noreply@${MAIL_DOMAIN}`;

    // 트래킹 픽셀 베이스 URL
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const baseUrl = `${proto}://${host}`;

    const sentAt = new Date().toISOString();
    // 열람 추적 id는 메일당 하나뿐이다. 누가 열었는지는 픽셀 URL에 실린 주소로 구분하므로
    // 수신자별 id를 만들어 미리 등록해 둘 필요가 없다 — 문서는 열람이 일어날 때 생긴다.
    const trackId = crypto.randomUUID();
    // 수신자별 발송 실패를 모았다가 마지막에 한 번에 보고한다. 첫 실패로 중단하면
    // 나머지 수신자에게 보낼 기회를 잃는다.
    const sendFailures: string[] = [];

    if (USE_SMTP) {
      // ── SMTP 모드: 발송 큐에 저장 (사내 에이전트가 처리) ──────
      const tenantDoc = await adminDb.collection("tenants").doc(fromEmail).get();
      if (!tenantDoc.exists) {
        return NextResponse.json({ error: "테넌트 설정을 찾을 수 없습니다." }, { status: 403 });
      }
      const tenant = tenantDoc.data()!;
      if (!tenant.smtp_host || !tenant.smtp_pass) {
        return NextResponse.json({ error: "SMTP 설정이 없습니다. 설정 → 연결 설정에서 입력해주세요." }, { status: 400 });
      }

      const jobId = crypto.randomUUID();
      const pixel = `<img src="${baseUrl}/api/track?id=${trackId}" width="1" height="1" style="display:none;border:0;" alt="" />`;
      const trackedHtml = (html ?? text ?? "") + pixel;

      // 첨부파일을 R2에 업로드 (base64를 Firestore에 직접 넣지 않음 — 1MB 제한 회피)
      // 데몬이 R2에서 내려받아 OneDrive에 영구 보관 후 SMTP 발송, R2는 발송 완료 후 삭제
      const smtpBucket = process.env.CF_R2_BUCKET ?? DEFAULT_BUCKET;
      const queueAttachments = attachments?.length
        ? await Promise.all(
            (attachments as { filename?: string; content?: string; content_type?: string }[]).map(async (a) => {
              const filename = a.filename ?? "attachment";
              const contentType = a.content_type ?? "application/octet-stream";
              if (!a.content) return { filename, r2Key: null, contentType, size: 0 };
              const body = Uint8Array.from(atob(a.content), (c) => c.charCodeAt(0));
              const r2Key = `mailAttachments/${jobId}/${filename}`;
              await s3Put(r2Key, body, contentType, smtpBucket);
              return { filename, r2Key, contentType, size: body.byteLength };
            })
          )
        : [];

      await adminDb.collection("mailQueue").add({
        from,
        fromEmail,
        to: toStr,
        ...(ccStr ? { cc: ccStr } : {}),
        // 데몬이 bcc를 읽어 SMTP 봉투에 실어야 실제로 발송된다(데몬 미대응 시 무시됨).
        ...(bccStr ? { bcc: bccStr } : {}),
        subject,
        text: text ?? "",
        html: trackedHtml,
        attachments: queueAttachments,
        trackId,
        smtp: {
          host: tenant.smtp_host,
          port: Number(tenant.smtp_port ?? 587),
          secure: tenant.smtp_secure === true,
          user: tenant.smtp_user || fromEmail,
          pass: tenant.smtp_pass,
        },
        status: "pending",
        createdAt: sentAt,
      });
    } else {
      // ── Resend 모드 ───────────────────────────────────────
      // 수신자마다 픽셀 URL이 달라야 누가 열었는지 구분되므로, 사본도 수신자별로 만든다.
      const pixel = (addr: string) =>
        `<img src="${baseUrl}/api/track?id=${trackId}&addr=${encodeURIComponent(addr)}" width="1" height="1" style="display:none;border:0;" alt="" />`;

      // 사본을 쪼개 보낸다는 사실이 수신자에게 드러나면 안 된다. 실제 배달 주소와 무관하게
      // 편지에 보이는 받는사람/참조는 항상 원본 그대로 유지한다.
      const visibleHeaders: Record<string, string> = { To: toStr };
      if (ccStr) visibleHeaders.Cc = ccStr;

      const resendAttachments = (attachments ?? []).map((a: { filename?: string; content?: string }) => ({
        filename: a.filename,
        content: a.content ? Buffer.from(a.content, "base64") : undefined,
      }));

      // 내부 주소는 Resend를 거치지 않고 수신자 받은편지함에 직접 넣는다. Resend로 @도메인에
      // 보내면 수신 워커가 같은 메일을 한 번 더 저장해 중복된다.
      // addr는 순수 주소(받은편지함 조회·알림·첨부 키용), recipient는 원본 문자열
      // (픽셀 addr= 값 — 보낸편지함 UI가 mail.to를 쪼개 만든 키와 같아야 열람 표시가 붙는다).
      const deliverInternal = async (addr: string, recipient: string) => {
        const mailId = crypto.randomUUID();
        const attachmentMeta = attachments?.length
          ? await uploadAttachmentsForRecipient(addr, mailId, attachments)
          : [];
        await adminDb.collection("mails").doc(mailId).set({
          id: mailId,
          // 실제 수신자가 보는 것과 같게 To/Cc 전체를 남긴다. 폴더 분류는 deliveredTo가 담당.
          to: toStr,
          ...(ccStr ? { cc: ccStr } : {}),
          from: fromEmail,
          subject,
          text: text ?? "",
          html: (html ?? text ?? "") + pixel(recipient),
          date: sentAt,
          read: false,
          attachments: attachmentMeta,
          createdAt: sentAt,
          deliveredTo: addr,
        });
        notify(addr, { from: fromEmail, subject, date: sentAt, mailId, text }).catch(() => {});
      };

      const deliverExternal = async (recipient: string) => {
        const { error: sendError } = await resend!.emails.send({
          from,
          to: [recipient],
          headers: visibleHeaders,
          subject,
          text: text ?? "",
          html: (html ?? text ?? "") + pixel(recipient),
          attachments: resendAttachments,
        });
        // Resend SDK는 API 오류를 throw하지 않고 error로 반환한다. 확인하지 않으면
        // 발송이 거부돼도 성공 응답이 나가고 보낸편지함에만 기록이 남는다.
        if (sendError) {
          sendFailures.push(`${recipient}: ${sendError.message ?? String(sendError)}`);
        }
      };

      // 받는사람·참조·숨은참조 전원에게 각자 사본을 보낸다. 예전에는 참조/숨은참조를 받는사람
      // 발송 요청에 얹어 보냈는데, 그러면 받는사람이 전부 내부 주소일 때 외부 발송 자체가
      // 일어나지 않아 외부 참조자에게 메일이 아예 가지 않았다. 반대로 외부 받는사람이 여럿이면
      // 그 수만큼 참조자에게 중복 발송됐다. 수신자 단위로 한 번씩 돌면 양쪽 다 사라진다.
      const delivered = new Set<string>();
      for (const raw of [...toList, ...ccList, ...bccList]) {
        const recipient = raw.trim();
        if (!recipient) continue;
        // 같은 사람이 받는사람엔 이름과 함께, 참조엔 주소만으로 적힐 수 있다. 중복 판정도
        // 순수 주소로 해야 그 경우 사본이 두 번 가지 않는다.
        const addr = bareAddress(recipient);
        const dedupeKey = addr.toLowerCase();
        if (delivered.has(dedupeKey)) continue;
        delivered.add(dedupeKey);
        if (addr.endsWith(`@${MAIL_DOMAIN}`)) await deliverInternal(addr, recipient);
        else await deliverExternal(recipient);
      }
    }

    // 한 명이라도 실패했으면 성공 응답을 내지 않는다. 성공으로 응답하면 클라이언트가
    // 보낸편지함에 기록해 버려서, 도착하지 않은 메일이 보낸 것처럼 남는다.
    if (sendFailures.length > 0) {
      return NextResponse.json(
        { error: `발송 실패 — ${sendFailures.join(" / ")}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      sentMail: {
        to: toStr,
        ...(ccStr ? { cc: ccStr } : {}),
        ...(bccStr ? { bcc: bccStr } : {}),
        from: fromEmail,
        subject,
        text: text ?? "",
        html: html ?? text ?? "",
        attachmentNames,
        trackId,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[send] 오류:", message);
    return NextResponse.json({ error: `발송 중 오류: ${message}` }, { status: 500 });
  }
}
