import { NextRequest, NextResponse } from "next/server";
import { sendAppUpdateNotification } from "@/lib/app-update";

// 외부(스크립트/CI)에서 공유시크릿으로 호출하는 경로. mdl.kr/admin 에서 관리자 로그인으로
// 보내려면 /api/admin/notify-app-update 를 대신 쓴다(같은 sendAppUpdateNotification 재사용).
const DEFAULT_TITLE = "MailXC 새 버전이 나왔습니다";
const DEFAULT_BODY = "탭해서 업데이트하세요.";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-app-update-secret");
  if (!secret || secret !== process.env.APP_UPDATE_NOTIFY_SECRET) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const title = typeof body.title === "string" && body.title.trim() ? body.title : DEFAULT_TITLE;
  const text = typeof body.body === "string" && body.body.trim() ? body.body : DEFAULT_BODY;
  const url = typeof body.url === "string" && body.url.trim() ? body.url : undefined;

  const messageId = await sendAppUpdateNotification({ title, body: text, url });
  return NextResponse.json({ ok: true, messageId });
}
