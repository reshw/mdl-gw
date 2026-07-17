import { createHmac, timingSafeEqual } from "crypto";

// 알림메일 수신거부 링크용 서명 토큰.
// 이메일 주소를 URL에 평문으로 싣지 않도록 base64url로 감싸고,
// NOTIFY_SECRET 기반 HMAC으로 위조를 막는다. (만료 없음 — 수신거부는 언제 눌러도 유효해야 함)
const SECRET = process.env.NOTIFY_SECRET ?? "";

export function createUnsubscribeToken(mailEmail: string): string {
  const sig = createHmac("sha256", SECRET).update(mailEmail).digest("hex");
  return `${Buffer.from(mailEmail, "utf8").toString("base64url")}.${sig}`;
}

// 유효하면 mailEmail 반환, 아니면 null
export function verifyUnsubscribeToken(token: string): string | null {
  if (!SECRET) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  let mailEmail: string;
  try {
    mailEmail = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!mailEmail.includes("@")) return null;
  const given = Buffer.from(token.slice(dot + 1), "utf8");
  const expected = Buffer.from(
    createHmac("sha256", SECRET).update(mailEmail).digest("hex"),
    "utf8"
  );
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return mailEmail;
}
