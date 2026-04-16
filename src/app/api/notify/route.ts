import { NextRequest, NextResponse } from "next/server";
import { notify } from "@/lib/notify";

// mailer-worker가 Firestore Admin 없이 알림 발송할 때 사용하는 프록시
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-notify-secret");
  if (!secret || secret !== process.env.NOTIFY_SECRET) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const { to, from, subject, date } = await req.json();
  if (!to || !from || !subject) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  await notify(to, { from, subject, date: date ?? new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
