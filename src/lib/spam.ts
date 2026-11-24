import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";

// 차단 목록 API(/api/spam-blocks) 클라이언트. 목록은 테넌트 관리 DB에 있고
// 메일 수신 워커가 읽으므로, 개인 DB가 아니라 서버를 거쳐 쓴다.

export interface SpamBlocks {
  addresses: string[];
  domains: string[];
}

async function call(method: "GET" | "POST" | "DELETE", value?: string): Promise<Response> {
  if (!auth.currentUser) throw new Error("로그인이 필요합니다.");
  const token = await getIdToken(auth.currentUser);
  const res = await fetch("/api/spam-blocks", {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(value !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(value !== undefined ? { body: JSON.stringify({ value }) } : {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `요청 실패 (${res.status})`);
  }
  return res;
}

export async function fetchSpamBlocks(): Promise<SpamBlocks> {
  return (await call("GET")).json();
}

export async function addSpamBlock(value: string): Promise<void> {
  await call("POST", value);
}

export async function removeSpamBlock(value: string): Promise<void> {
  await call("DELETE", value);
}

/** "이름 <a@b.com>" → "a@b.com" */
export function senderAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

export const SPAM_REASON_LABEL: Record<string, string> = {
  blocked: "차단한 발신자",
  auth: "발신자 인증 실패(사칭 의심)",
  user: "직접 신고",
};
