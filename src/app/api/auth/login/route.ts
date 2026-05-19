import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const USE_SMTP = process.env.MAIL_TRANSPORT === "smtp";

export async function POST(req: NextRequest) {
  const { id, password } = await req.json();

  if (!id || !password) {
    return NextResponse.json({ error: "아이디와 비밀번호를 입력해주세요." }, { status: 400 });
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (USE_SMTP) {
    // SMTP 모드: id = 풀 이메일(shy@wm.co.kr), tenants에 등록된 사용자만 허용
    const tenantDoc = await adminDb.collection("tenants").doc(id).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: "등록되지 않은 계정입니다. EmailArchiver 설정을 먼저 완료해주세요." }, { status: 401 });
    }

    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: id, password, returnSecureToken: true }),
      }
    );
    const body = await res.json();

    if (body.error) {
      return NextResponse.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const customToken = await adminAuth.createCustomToken(body.localId, { mailEmail: id, isAdmin: false });
    return NextResponse.json({ token: customToken });
  }

  // 기존 모드: id = username, members 컬렉션 조회
  const MAIL_DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr";
  const doc = await adminDb.collection("members").doc(`${id}@${MAIL_DOMAIN}`).get();
  if (!doc.exists) {
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const { personalEmail, isAdmin = false } = doc.data()!;
  if (!personalEmail) {
    return NextResponse.json({ error: "계정 정보가 올바르지 않습니다. 관리자에게 문의하세요." }, { status: 401 });
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: personalEmail, password, returnSecureToken: true }),
    }
  );
  const body = await res.json();

  if (body.error) {
    if (body.error.message === "USER_DISABLED") {
      return NextResponse.json({ error: "승인 대기 중인 계정입니다." }, { status: 401 });
    }
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const mailEmail = `${id}@${MAIL_DOMAIN}`;
  const customToken = await adminAuth.createCustomToken(body.localId, { mailEmail, isAdmin });
  return NextResponse.json({ token: customToken });
}
