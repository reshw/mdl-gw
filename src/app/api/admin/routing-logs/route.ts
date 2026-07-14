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

  const snap = await adminDb.collection("routing_logs")
    .orderBy("createdAt", "desc")
    .limit(30)
    .get();

  const logs = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      email: d.email,
      success: d.success === true,
      error: d.error ?? "",
      createdAt: d.createdAt,
    };
  });

  return NextResponse.json({ logs });
}
