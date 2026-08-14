// 첨부파일이 올라가는 S3 호환 오브젝트 스토리지에 대한 SigV4 서명 로직.
// 기본값은 지금까지 쓰던 Cloudflare R2 그대로다 — S3_ENDPOINT_HOST/S3_REGION을
// 설정하지 않은 테넌트는 동작이 한 글자도 안 바뀐다. 테넌트별로 Backblaze B2 같은
// 다른 S3 호환 공급자로 옮기고 싶으면 그 두 값만 그 테넌트의 Vercel 환경변수에 추가하면 된다.
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "163aa19364534ce7386a3430efacb2a3";
const HOST = process.env.S3_ENDPOINT_HOST ?? `${ACCOUNT_ID}.r2.cloudflarestorage.com`;
const REGION = process.env.S3_REGION ?? "auto";
export const DEFAULT_BUCKET = process.env.R2_BUCKET ?? "mailer-attachments";

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

async function sha256Hex(data: Uint8Array | ArrayBuffer | string): Promise<string> {
  const arr = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  const hash = await crypto.subtle.digest("SHA-256", arr);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacRaw(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = key instanceof Uint8Array ? new Uint8Array(key) : key;
  const cryptoKey = await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  const sig = await hmacRaw(key, data);
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function deriveSigningKey(secret: string, date: string): Promise<ArrayBuffer> {
  const kDate = await hmacRaw(new TextEncoder().encode(`AWS4${secret}`), date);
  const kRegion = await hmacRaw(kDate, REGION);
  const kService = await hmacRaw(kRegion, "s3");
  return hmacRaw(kService, "aws4_request");
}

// encodeURIComponent는 !'()* 를 안전 문자로 보고 그대로 두지만, AWS SigV4 정규 URI 규칙은
// 이 문자들도 퍼센트 인코딩해야 한다. 안 맞추면 서명이 어긋나 파일명에 괄호 등이 든
// 첨부에서만 SignatureDoesNotMatch가 난다.
function awsUriEscape(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function datetimeNow(): { datetime: string; date: string } {
  const datetime = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { datetime, date: datetime.slice(0, 8) };
}

async function sign(
  method: "GET" | "PUT",
  bucket: string,
  key: string,
  opts: { payloadHash: string; contentType?: string }
): Promise<{ url: string; headers: Record<string, string> }> {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
  const encodedPath = `/${bucket}/${key.split("/").map(awsUriEscape).join("/")}`;
  const url = `https://${HOST}${encodedPath}`;
  const { datetime, date } = datetimeNow();
  const signedHeaders = opts.contentType
    ? "content-type;host;x-amz-content-sha256;x-amz-date"
    : "host;x-amz-content-sha256;x-amz-date";

  const canonicalHeaders = [
    ...(opts.contentType ? [`content-type:${opts.contentType}`] : []),
    `host:${HOST}`,
    `x-amz-content-sha256:${opts.payloadHash}`,
    `x-amz-date:${datetime}`,
  ];
  const canonicalRequest = [
    method,
    encodedPath,
    "",
    ...canonicalHeaders,
    "",
    signedHeaders,
    opts.payloadHash,
  ].join("\n");

  const credentialScope = `${date}/${REGION}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    datetime,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(secretAccessKey, date);
  const signature = await hmacHex(signingKey, stringToSign);
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url,
    headers: {
      ...(opts.contentType ? { "Content-Type": opts.contentType } : {}),
      "x-amz-date": datetime,
      "x-amz-content-sha256": opts.payloadHash,
      Authorization: authorization,
    },
  };
}

export async function s3Put(
  key: string,
  body: Uint8Array | ArrayBuffer,
  contentType: string,
  bucket: string = DEFAULT_BUCKET
): Promise<void> {
  const data = new Uint8Array(body);
  const payloadHash = await sha256Hex(data);
  const { url, headers } = await sign("PUT", bucket, key, { payloadHash, contentType });

  const res = await fetch(url, { method: "PUT", headers, body: data });
  if (!res.ok) {
    const resBody = await res.text();
    throw new Error(`스토리지 업로드 실패 (${res.status}) url=${url}: ${resBody}`);
  }
}

export async function s3Get(key: string, bucket: string = DEFAULT_BUCKET): Promise<Response> {
  const { url, headers } = await sign("GET", bucket, key, { payloadHash: EMPTY_SHA256 });
  return fetch(url, { headers });
}
