import { NextRequest, NextResponse } from "next/server";
import { adminDb, assertAdmin } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  try {
    if (!await assertAdmin(token)) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
  }

  const snap = await adminDb.collection("signup_requests")
    .where("status", "==", "pending")
    .get();

  const requests = snap.docs.map((doc) => ({
    docId: doc.id,
    id: doc.data().id,
    name: doc.data().name,
    status: doc.data().status,
    createdAt: doc.data().createdAt,
  }));

  return NextResponse.json({ requests });
}
