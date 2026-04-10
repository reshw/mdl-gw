import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  let email: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    email = decoded.email ?? "";
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
  }

  const snap = await adminDb.collection("userSettings").doc(email).get();
  const signature = snap.exists ? (snap.data()?.signature ?? "") : "";
  return NextResponse.json({ signature });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  let email: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    email = decoded.email ?? "";
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
  }

  const { signature } = await req.json();
  await adminDb.collection("userSettings").doc(email).set({ signature }, { merge: true });
  return NextResponse.json({ ok: true });
}
