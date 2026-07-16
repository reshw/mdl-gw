import { NextRequest, NextResponse } from "next/server";
import { fetchAndCacheBimi, getBimiStatus, senderDomain, bimiConfigured } from "@/lib/bimi";

// 임시 진단용 — 확인 후 즉시 삭제. BIMI 파이프라인을 실제 런타임에서 강제 실행.
// GET /api/debugbimiwarm?domain=cloudflare.com
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("domain") ?? "";
  const domain = senderDomain(raw.includes("@") ? raw : `x@${raw}`);
  if (!domain) return NextResponse.json({ error: "bad domain" }, { status: 400 });
  const before = await getBimiStatus(domain);
  await fetchAndCacheBimi(domain);
  const after = await getBimiStatus(domain);
  return NextResponse.json({ domain, configured: bimiConfigured(), before, after });
}
