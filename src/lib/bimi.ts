import { adminDb } from "@/lib/firebase-admin";
import dns from "node:dns/promises";
import sharp from "sharp";

// BIMI(Brand Indicators for Message Identification) 로고 조회/변환/캐싱.
//
// 발신 도메인의 DNS(default._bimi.{domain} TXT)에 브랜드 로고 SVG URL이 공개돼 있으면
// 이를 받아 PNG로 변환해 "중앙 R2 저장소"(scnd 계정 버킷)에 올려두고,
// 조회 결과를 Firestore(bimiCache/{domain})에 캐싱한다.
// iOS 알림은 이 PNG를 발신자 아바타로 표시(우측 하단에 앱 아이콘 배지).
//
// 저장소는 전 배포 공용 — BIMI_R2_* 환경변수(중앙 scnd R2)를 모든 gw 배포에 동일하게 넣는다.

const R2_ACCOUNT_ID = process.env.BIMI_R2_ACCOUNT_ID ?? "";
const R2_ACCESS_KEY_ID = process.env.BIMI_R2_ACCESS_KEY_ID ?? "";
const R2_SECRET_ACCESS_KEY = process.env.BIMI_R2_SECRET_ACCESS_KEY ?? "";
const R2_BUCKET = process.env.BIMI_R2_BUCKET ?? "";

const MAX_SVG_BYTES = 200 * 1024; // BIMI SVG는 보통 수 KB. 방어적 상한.
const NONE_RECHECK_MS = 30 * 24 * 60 * 60 * 1000; // 로고 없던 도메인 30일 후 재확인
const FETCH_TIMEOUT_MS = 5000;

export function bimiConfigured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

// "이름 <a@b.com>" 또는 "a@b.com" → "b.com"
export function senderDomain(from: string | undefined): string | null {
  if (!from) return null;
  const m = from.match(/<([^>]+)>/);
  const addr = (m ? m[1] : from).trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at < 0) return null;
  const domain = addr.slice(at + 1).replace(/[>\s]+$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  return domain;
}

export function logoObjectKey(domain: string): string {
  return `bimi-logos/${domain}.png`;
}

type BimiStatus = "has" | "none" | "uncached";

// Firestore 캐시만 조회(빠름). 발송 경로에서 블로킹 없이 쓰기 위함.
export async function getBimiStatus(domain: string): Promise<BimiStatus> {
  try {
    const snap = await adminDb.collection("bimiCache").doc(domain).get();
    if (!snap.exists) return "uncached";
    const d = snap.data()!;
    if (d.hasLogo === true) return "has";
    // 로고 없음 캐시 — 만료됐으면 재확인 대상
    const fetchedAt = typeof d.fetchedAt === "number" ? d.fetchedAt : 0;
    if (Date.now() - fetchedAt > NONE_RECHECK_MS) return "uncached";
    return "none";
  } catch {
    return "uncached";
  }
}

// 전체 파이프라인: DNS 조회 → SVG 다운로드 → PNG 변환 → R2 업로드 → 캐시 기록.
// 백그라운드(next/server after)에서 호출 — 발송을 지연시키지 않는다.
export async function fetchAndCacheBimi(domain: string): Promise<void> {
  if (!bimiConfigured()) return;
  try {
    const logoUrl = await lookupBimiLogoUrl(domain);
    if (!logoUrl) {
      await writeCache(domain, false);
      return;
    }
    const svg = await downloadWithLimit(logoUrl, MAX_SVG_BYTES);
    if (!svg) {
      await writeCache(domain, false);
      return;
    }
    const png = await sharp(svg, { density: 200 })
      .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await uploadToR2(logoObjectKey(domain), new Uint8Array(png), "image/png");
    await writeCache(domain, true);
    console.log(`[bimi] ${domain}: 로고 캐싱 완료 (${png.length}B)`);
  } catch (e) {
    console.error(`[bimi] ${domain}: 처리 실패:`, e instanceof Error ? e.message : String(e));
    // 실패도 'none'으로 캐싱해 반복 시도 폭주를 막는다(만료 후 재시도).
    await writeCache(domain, false).catch(() => {});
  }
}

async function writeCache(domain: string, hasLogo: boolean): Promise<void> {
  await adminDb.collection("bimiCache").doc(domain).set({
    hasLogo,
    fetchedAt: Date.now(),
  });
}

async function lookupBimiLogoUrl(domain: string): Promise<string | null> {
  let records: string[][];
  try {
    records = await dns.resolveTxt(`default._bimi.${domain}`);
  } catch {
    return null;
  }
  const flat = records.map((r) => r.join("")).join("");
  const m = flat.match(/(?:^|;)\s*l=([^;]+)/i);
  const url = m?.[1]?.trim();
  if (!url) return null;
  if (!/^https:\/\//i.test(url)) return null; // BIMI는 https만 허용
  return url;
}

async function downloadWithLimit(url: string, maxBytes: number): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > maxBytes) return null;
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── R2 SigV4 (send/route.ts와 동일 패턴, BIMI 전용 자격증명) ──────────────

const R2_ENDPOINT = () => `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  const hash = await crypto.subtle.digest("SHA-256", buf);
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
async function signingKey(date: string): Promise<ArrayBuffer> {
  const kDate = await hmacRaw(new TextEncoder().encode(`AWS4${R2_SECRET_ACCESS_KEY}`), date);
  const kRegion = await hmacRaw(kDate, "auto");
  const kService = await hmacRaw(kRegion, "s3");
  return hmacRaw(kService, "aws4_request");
}

async function uploadToR2(key: string, input: Uint8Array, contentType: string): Promise<void> {
  const body = new Uint8Array(input); // ArrayBuffer-backed 정규화 (fetch/digest 타입 요구)
  const encodedPath = `/${R2_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const url = `${R2_ENDPOINT()}${encodedPath}`;
  const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const date = datetime.slice(0, 8);
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const payloadHash = await sha256Hex(body);
  const canonical = [
    "PUT", encodedPath, "",
    `content-type:${contentType}`, `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${datetime}`, "",
    signedHeaders, payloadHash,
  ].join("\n");
  const scope = `${date}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", datetime, scope, await sha256Hex(new TextEncoder().encode(canonical))].join("\n");
  const signature = await hmacHex(await signingKey(date), stringToSign);
  const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType, "x-amz-date": datetime, "x-amz-content-sha256": payloadHash, Authorization: authorization },
    body,
  });
  if (!res.ok) throw new Error(`R2 업로드 실패(${res.status}): ${await res.text()}`);
}

// 서명된 GET — /api/bimi-logo 엔드포인트가 스트리밍에 사용.
export async function signedR2Get(key: string): Promise<Response> {
  const encodedPath = `/${R2_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const url = `${R2_ENDPOINT()}${encodedPath}`;
  const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const date = datetime.slice(0, 8);
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const payloadHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // empty
  const canonical = [
    "GET", encodedPath, "",
    `host:${host}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${datetime}`, "",
    signedHeaders, payloadHash,
  ].join("\n");
  const scope = `${date}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", datetime, scope, await sha256Hex(new TextEncoder().encode(canonical))].join("\n");
  const signature = await hmacHex(await signingKey(date), stringToSign);
  const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return fetch(url, {
    headers: { "x-amz-date": datetime, "x-amz-content-sha256": payloadHash, Authorization: authorization },
  });
}
