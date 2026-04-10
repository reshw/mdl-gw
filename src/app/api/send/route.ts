import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const resend = new Resend(process.env.RESEND_API_KEY);

const R2_ACCOUNT_ID = "163aa19364534ce7386a3430efacb2a3";
const R2_BUCKET = "mailer-attachments";
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacRaw(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function deriveSigningKey(secret: string, date: string): Promise<ArrayBuffer> {
  const kDate = await hmacRaw(new TextEncoder().encode(`AWS4${secret}`), date);
  const kRegion = await hmacRaw(kDate, "auto");
  const kService = await hmacRaw(kRegion, "s3");
  return hmacRaw(kService, "aws4_request");
}

async function uploadToR2(key: string, body: Uint8Array, contentType: string): Promise<void> {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;

  const encodedPath = `/${R2_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const url = `${R2_ENDPOINT}${encodedPath}`;
  const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const date = datetime.slice(0, 8);
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const payloadHash = await sha256Hex(body);

  const canonicalRequest = [
    "PUT",
    encodedPath,
    "",
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${datetime}`,
    "",
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${date}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    datetime,
    credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join("\n");

  const signingKey = await deriveSigningKey(secretAccessKey, date);
  const signature = await hmacHex(signingKey, stringToSign);
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-date": datetime,
      "x-amz-content-sha256": payloadHash,
      Authorization: authorization,
    },
    body,
  });

  if (!res.ok) throw new Error(`R2 업로드 실패: ${await res.text()}`);
}

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
      await uploadToR2(key, body, contentType);
      return { name: filename, contentType, size: body.byteLength, r2Key: key };
    })
  );
  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}

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

    if (recipient.endsWith("@mdl.kr")) {
      // 내부 메일: Resend 우회, Firestore에 직접 저장
      const mailId = crypto.randomUUID();
      const attachmentMeta = attachments?.length
        ? await uploadAttachmentsForRecipient(recipient, mailId, attachments)
        : [];
      await adminDb.collection("mails").doc(mailId).set({
        id: mailId,
        to: recipient,
        from: fromEmail,
        subject,
        text: text ?? "",
        html: trackedHtml,
        date: sentAt,
        read: false,
        attachments: attachmentMeta,
        createdAt: sentAt,
      });
    } else {
      // CC/BCC에서 내부 주소 제거 — Resend가 @mdl.kr로 SMTP 발송하면 mailer-worker가 중복 저장함
      const externalCcList = ccList.filter((c) => !c.endsWith("@mdl.kr"));
      const externalCcStr = externalCcList.length > 0 ? externalCcList.join(", ") : undefined;
      const bccList: string[] = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [];
      const externalBccList = bccList.filter((c) => !c.endsWith("@mdl.kr"));
      const externalBccStr = externalBccList.length > 0 ? externalBccList.join(", ") : undefined;

      await resend.emails.send({
        from,
        to: [recipient],
        // 전체 수신자 목록을 To 헤더에 표시 (수신자 눈에는 그룹메일처럼 보임)
        headers: toList.length > 1 ? { "To": toStr } : undefined,
        ...(externalCcStr ? { cc: externalCcStr } : {}),
        ...(externalBccStr ? { bcc: externalBccStr } : {}),
        subject,
        text: text ?? "",
        html: trackedHtml,
        attachments: attachments ?? [],
      });
    }
  }

  // CC 중 @mdl.kr 수신자도 내부 직접 저장
  for (const ccRecipient of ccList) {
    if (!ccRecipient.endsWith("@mdl.kr")) continue;
    const trackId = crypto.randomUUID();
    trackIds[ccRecipient] = trackId;
    const pixel = `<img src="${baseUrl}/api/track?id=${trackId}" width="1" height="1" style="display:none;border:0;" alt="" />`;
    const trackedHtml = (html ?? text ?? "") + pixel;
    await adminDb.collection("tracking").doc(trackId).set({ recipient: ccRecipient, sentAt, openedAt: null });
    const mailId = crypto.randomUUID();
    const attachmentMeta = attachments?.length
      ? await uploadAttachmentsForRecipient(ccRecipient, mailId, attachments)
      : [];
    await adminDb.collection("mails").doc(mailId).set({
      id: mailId,
      to: ccRecipient,
      from: fromEmail,
      subject,
      text: text ?? "",
      html: trackedHtml,
      date: sentAt,
      read: false,
      attachments: attachmentMeta,
      createdAt: sentAt,
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
      trackIds,
    },
  });
}
