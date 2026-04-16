import { NextRequest, NextResponse } from "next/server";
import { adminDb, assertAdmin } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  try {
    if (!await assertAdmin(token)) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
  }

  const snap = await adminDb.collection("signup_requests")
    .where("status", "==", "approved")
    .get();

  const batch = adminDb.batch();
  let count = 0;

  for (const doc of snap.docs) {
    const { id, name } = doc.data();
    if (!id || !name) continue;
    const email = `${id}@${process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr"}`;
    const ref = adminDb.collection("members").doc(email);
    batch.set(ref, { email, name, createdAt: doc.data().approvedAt ?? doc.data().createdAt ?? new Date().toISOString() }, { merge: true });
    count++;
  }

  await batch.commit();

  return NextResponse.json({ ok: true, count });
}
