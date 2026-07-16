import { NextRequest, NextResponse } from "next/server";
import { senderDomain, logoObjectKey, signedR2Get, bimiConfigured } from "@/lib/bimi";

// 발신 도메인의 BIMI 로고 PNG를 중앙 R2에서 스트리밍.
// iOS Notification Service Extension이 인증 없이 이 URL로 받아 발신자 아바타로 사용.
// 로고는 공개 브랜드 마크라 민감정보 아님 — 인증 불필요.
//   GET /api/bimi-logo?domain=cloudflare.com
export async function GET(req: NextRequest) {
  if (!bimiConfigured()) {
    return NextResponse.json({ error: "BIMI 미설정" }, { status: 404 });
  }
  const raw = req.nextUrl.searchParams.get("domain") ?? "";
  // domain 파라미터도 senderDomain으로 정규화·검증(경로 주입 방지)
  const domain = senderDomain(raw.includes("@") ? raw : `x@${raw}`);
  if (!domain) {
    return NextResponse.json({ error: "잘못된 domain" }, { status: 400 });
  }

  const r2 = await signedR2Get(logoObjectKey(domain));
  if (!r2.ok || !r2.body) {
    return NextResponse.json({ error: "로고 없음" }, { status: 404 });
  }

  return new NextResponse(r2.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
