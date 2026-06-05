import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

// 최초 1회 어드민 지정용 — BOOTSTRAP_SECRET 환경변수로 보호
export async function POST(req: NextRequest) {
  const secret = process.env.BOOTSTRAP_SECRET;
  if (!secret) return NextResponse.json({ error: "BOOTSTRAP_SECRET not set" }, { status: 403 });

  const { email, bootstrapSecret } = await req.json();
  if (bootstrapSecret !== secret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const user = await adminAuth.getUserByEmail(email);

  // Firebase Auth custom claim 설정
  await adminAuth.setCustomUserClaims(user.uid, {
    ...user.customClaims,
    isAdmin: true,
  });

  // Firestore members 문서 생성/업데이트
  await adminDb.collection("members").doc(email).set({ isAdmin: true, email }, { merge: true });

  return NextResponse.json({ ok: true, email });
}
