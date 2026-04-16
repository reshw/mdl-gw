import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const { id, password } = await req.json();

  if (!id || !password) {
    return NextResponse.json({ error: "아이디와 비밀번호를 입력해주세요." }, { status: 400 });
  }

  // members에서 id로 personalEmail 조회
  const snap = await adminDb.collection("members").where("id", "==", id).limit(1).get();
  if (snap.empty) {
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const { personalEmail } = snap.docs[0].data();
  if (!personalEmail) {
    return NextResponse.json({ error: "계정 정보가 올바르지 않습니다. 관리자에게 문의하세요." }, { status: 401 });
  }

  // Firebase REST API로 비밀번호 검증
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: personalEmail, password, returnSecureToken: true }),
    }
  );

  const body = await res.json();

  if (body.error) {
    const code = body.error.message ?? "";
    if (code === "USER_DISABLED") {
      return NextResponse.json({ error: "승인 대기 중인 계정입니다." }, { status: 401 });
    }
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const customToken = await adminAuth.createCustomToken(body.localId);
  return NextResponse.json({ token: customToken });
}
