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
  const saved = doc.data()?.notifications ?? {};
  return NextResponse.json({
    emailEnabled: saved.emailEnabled !== false,
    pushEnabled: saved.pushEnabled !== false,
  });
}

export async function POST(req: NextRequest) {
  const email = await getEmail(req);
  if (!email) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { emailEnabled, pushEnabled } = await req.json();
  const update: Record<string, boolean> = {};
  if (emailEnabled !== undefined) update["notifications.emailEnabled"] = !!emailEnabled;
  if (pushEnabled !== undefined) update["notifications.pushEnabled"] = !!pushEnabled;
  if (Object.keys(update).length > 0) {
    // update()는 문서가 없으면 실패하므로 set+merge 대신 점표기 병합을 위해 update 사용,
    // 문서가 없을 수 있으니 먼저 merge로 보장
    await adminDb.collection("members").doc(email).set({}, { merge: true });
    await adminDb.collection("members").doc(email).update(update);
  }
  return NextResponse.json({ ok: true });
}
