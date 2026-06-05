import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  await adminDb.collection("tenants").doc(email).set({
    share_request: { status: "rejected", rejectedAt: new Date().toISOString() },
  }, { merge: true });

  return NextResponse.json({ ok: true });
}
