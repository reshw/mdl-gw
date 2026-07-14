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

  // success==false 대상 orderBy는 복합 인덱스가 필요하므로, 최근 N건을 가져와 코드에서 필터링한다.
  const snap = await adminDb.collection("routing_logs")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  const failures = snap.docs
    .map((doc) => doc.data())
    .filter((d) => d.success === false)
    .slice(0, 20)
    .map((d) => ({
      email: d.email,
      error: d.error ?? "",
      createdAt: d.createdAt,
    }));

  return NextResponse.json({ failures });
}
