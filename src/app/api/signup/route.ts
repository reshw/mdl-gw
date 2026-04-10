import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const { id, name, password } = await req.json();

  if (!id || !name || !password) {
    return NextResponse.json({ error: "필수 항목을 입력해주세요." }, { status: 400 });
  }

  const idRegex = /^[a-z0-9]{2,20}$/;
  if (!idRegex.test(id)) {
    return NextResponse.json({ error: "아이디는 영문 소문자/숫자 2~20자입니다." }, { status: 400 });
  }

  // 중복 확인
  const existing = await adminDb.collection("signup_requests")
    .where("id", "==", id)
    .limit(1)
    .get();

  if (!existing.empty) {
    return NextResponse.json({ error: "이미 신청된 아이디입니다." }, { status: 400 });
  }

  // 가입 신청 저장
  await adminDb.collection("signup_requests").add({
    id,
    name,
    password,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
