import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ isAdmin: false });

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = (decoded.mailEmail as string | undefined) ?? decoded.email;
    if (!email) return NextResponse.json({ isAdmin: false });

    const doc = await adminDb.collection("members").doc(email).get();
    return NextResponse.json({ isAdmin: doc.exists && doc.data()?.isAdmin === true });
  } catch {
    return NextResponse.json({ isAdmin: false });
  }
}
