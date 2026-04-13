import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const ADMIN_EMAIL = "reshw@naver.com";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }
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
    const email = `${id}@mdl.kr`;
    const ref = adminDb.collection("members").doc(email);
    batch.set(ref, { email, name, createdAt: doc.data().approvedAt ?? doc.data().createdAt ?? new Date().toISOString() }, { merge: true });
    count++;
  }

  await batch.commit();

  return NextResponse.json({ ok: true, count });
}
