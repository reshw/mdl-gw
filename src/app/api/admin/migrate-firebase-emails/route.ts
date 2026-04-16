import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, assertAdmin } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  try {
    if (!await assertAdmin(token)) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
  }

  const MAIL_DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr";
  const snap = await adminDb.collection("members").get();
  const results: { email: string; personalEmail: string; status: string }[] = [];

  for (const doc of snap.docs) {
    const { email, personalEmail } = doc.data();

    if (!personalEmail) {
      results.push({ email, personalEmail: "", status: "skipped (no personalEmail)" });
      continue;
    }

    try {
      const userRecord = await adminAuth.getUserByEmail(email);

      if (!userRecord.email?.endsWith(`@${MAIL_DOMAIN}`)) {
        results.push({ email, personalEmail, status: "skipped (already migrated)" });
        continue;
      }

      await adminAuth.updateUser(userRecord.uid, { email: personalEmail });
      results.push({ email, personalEmail, status: "ok" });
    } catch (e) {
      results.push({ email, personalEmail, status: `error: ${e instanceof Error ? e.message : e}` });
    }
  }

  return NextResponse.json({ ok: true, results });
}
