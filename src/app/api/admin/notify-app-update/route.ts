import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/firebase-admin";
import { sendAppUpdateNotification } from "@/lib/app-update";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  try {
    if (!await assertAdmin(token)) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
  }

  const { version, notes, url } = await req.json();
  if (!version || !notes) {
    return NextResponse.json({ error: "버전과 변경 내용을 입력하세요." }, { status: 400 });
  }

  const title = `MailXC v${version} 업데이트`;
  const messageId = await sendAppUpdateNotification({ title, body: notes, url: url || undefined });
  return NextResponse.json({ ok: true, messageId });
}
