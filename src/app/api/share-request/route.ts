import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

async function getMailEmail(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return (decoded.mailEmail as string) ?? decoded.email ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const mailEmail = await getMailEmail(req);
  if (!mailEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });

  const snap = await adminDb.collection("tenants").doc(mailEmail).get();
  if (!snap.exists) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = snap.data()?.share_request;
  if (existing?.status === "approved") {
    return NextResponse.json({ error: "이미 승인된 계정입니다." }, { status: 400 });
  }

  await adminDb.collection("tenants").doc(mailEmail).set({
    share_request: {
      name: name.trim(),
      status: "pending",
      requestedAt: new Date().toISOString(),
    },
  }, { merge: true });

  return NextResponse.json({ ok: true });
}
