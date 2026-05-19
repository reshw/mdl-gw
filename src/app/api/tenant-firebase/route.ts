import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let mailEmail: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    mailEmail = (decoded.mailEmail as string) ?? decoded.email ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  if (!mailEmail) return NextResponse.json({ error: "No email" }, { status: 400 });

  const snap = await adminDb.collection("tenants").doc(mailEmail).get();
  if (!snap.exists) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const config = snap.data()?.firebase_client_config;
  if (!config) return NextResponse.json({ error: "No firebase config" }, { status: 404 });

  return NextResponse.json(config);
}
