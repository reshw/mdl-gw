import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

async function getEmail(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return (decoded.mailEmail as string) ?? decoded.email ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const email = await getEmail(req);
  if (!email) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const doc = await adminDb.collection("members").doc(email).get();
  const notifications = doc.data()?.notifications ?? { emailEnabled: true };
  return NextResponse.json(notifications);
}

export async function POST(req: NextRequest) {
  const email = await getEmail(req);
  if (!email) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { emailEnabled } = await req.json();
  await adminDb.collection("members").doc(email).set(
    { notifications: { emailEnabled: !!emailEnabled } },
    { merge: true }
  );
  return NextResponse.json({ ok: true });
}
