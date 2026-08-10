import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

// 1x1 투명 GIF
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const addr = req.nextUrl.searchParams.get("addr");

  if (id) {
    const opened = {
      openedAt: new Date().toISOString(),
      ip: req.headers.get("x-forwarded-for") ?? "",
      userAgent: req.headers.get("user-agent") ?? "",
    };
    const ref = adminDb.collection("tracking").doc(id);
    // addr가 있으면 새 방식 — 메일당 문서 하나에 수신자별로 누적한다(발송 시 사전 등록 없음).
    // addr가 없으면 예전에 보낸 메일의 픽셀이므로 문서 최상위에 그대로 기록해 과거 기록과
    // 형태를 맞춘다. merge를 쓰는 이유는 SMTP 모드처럼 문서를 미리 만들지 않는 경로도 있어서다.
    (addr
      ? ref.set({ opens: { [addr]: opened } }, { merge: true })
      : ref.set(opened, { merge: true })
    ).catch(() => {});
  }

  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
  });
}
