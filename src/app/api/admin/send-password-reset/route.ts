import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, assertAdmin } from "@/lib/firebase-admin";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  try {
    if (!await assertAdmin(token)) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
  }

  const MAIL_DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr";

  // members 전체 조회
  const snap = await adminDb.collection("members").get();
  const results: { email: string; personalEmail: string; status: string }[] = [];

  for (const doc of snap.docs) {
    const { email, personalEmail, name } = doc.data();
    if (!personalEmail) {
      results.push({ email, personalEmail: "", status: "skipped (no personalEmail)" });
      continue;
    }

    try {
      const resetLink = await adminAuth.generatePasswordResetLink(personalEmail);
      await resend.emails.send({
        from: `noreply@${MAIL_DOMAIN}`,
        to: personalEmail,
        subject: `[${MAIL_DOMAIN}] 비밀번호 재설정 안내`,
        html: `
          <p>${name ?? email}님, 안녕하세요.</p>
          <p>서비스 보안 개선으로 비밀번호를 재설정하셔야 합니다.</p>
          <p><a href="${resetLink}" style="color:#1a1a1a;font-weight:bold;">비밀번호 재설정하기</a></p>
          <p style="color:#888;font-size:12px;">링크는 1시간 동안 유효합니다.</p>
        `,
      });
      results.push({ email, personalEmail, status: "sent" });
    } catch (e) {
      results.push({ email, personalEmail, status: `error: ${e instanceof Error ? e.message : e}` });
    }
  }

  return NextResponse.json({ ok: true, results });
}
