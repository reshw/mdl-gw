import { NextRequest, NextResponse } from "next/server";
import { adminDb, assertAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  try {
    if (!await assertAdmin(token)) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
  }

  const { requestId } = await req.json();

  await adminDb.collection("signup_requests").doc(requestId).update({
    status: "rejected",
    password: FieldValue.delete(),
    rejectedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
