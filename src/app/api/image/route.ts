import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

const R2_ACCOUNT_ID = "163aa19364534ce7386a3430efacb2a3";
const R2_BUCKET = process.env.R2_BUCKET ?? "mailer-attachments";
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

// 이미지 업로드 (인증 필요)
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const token = formData.get("token") as string;
  const file = formData.get("files[0]") as File ?? formData.get("files[]") as File;

  if (!token || !file) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  try {
    await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const key = `images/${crypto.randomUUID()}.${ext}`;
  const buffer = await file.arrayBuffer();

  await putR2(key, buffer, file.type || "image/png");

  const url = `/api/image?key=${encodeURIComponent(key)}`;
  return NextResponse.json({ files: [url], path: "", baseurl: "", error: 0, msg: "ok" });
}

// 이미지 서빙 (공개 — 수신자도 로딩 가능)
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const url = `${R2_ENDPOINT}/${R2_BUCKET}/${encodedKey}`;

  const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const date = datetime.slice(0, 8);
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const payloadHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = ["GET", `/${R2_BUCKET}/${encodedKey}`, "",
    `host:${host}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${datetime}`,
    "", signedHeaders, payloadHash].join("\n");

  const credentialScope = `${date}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", datetime, credentialScope,
    await sha256Hex(canonicalRequest)].join("\n");

  const signingKey = await deriveSigningKey(secretAccessKey, date);
  const signature = await hmacHex(signingKey, stringToSign);
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const r2Res = await fetch(url, {
    headers: { "x-amz-date": datetime, "x-amz-content-sha256": payloadHash, Authorization: authorization },
  });

  if (!r2Res.ok) return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });

  const contentType = r2Res.headers.get("content-type") ?? "image/png";
  return new NextResponse(r2Res.body, {
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000" },
  });
}

async function putR2(key: string, body: ArrayBuffer, contentType: string) {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
  const url = `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;

  const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const date = datetime.slice(0, 8);
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const payloadHash = await sha256HexBuffer(body);
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = ["PUT", `/${R2_BUCKET}/${key}`, "",
    `content-type:${contentType}`, `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${datetime}`,
    "", signedHeaders, payloadHash].join("\n");

  const credentialScope = `${date}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", datetime, credentialScope,
    await sha256Hex(canonicalRequest)].join("\n");

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

  if (!res.ok) throw new Error(`R2 업로드 실패: ${res.status}`);
}

async function sha256Hex(data: string): Promise<string> {
  const buf = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256HexBuffer(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacRaw(key: ArrayBuffer | Uint8Array<ArrayBuffer>, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function deriveSigningKey(secret: string, date: string): Promise<ArrayBuffer> {
  const kDate = await hmacRaw(new TextEncoder().encode(`AWS4${secret}`), date);
  const kRegion = await hmacRaw(kDate, "auto");
  const kService = await hmacRaw(kRegion, "s3");
  return hmacRaw(kService, "aws4_request");
}
