import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const secret = process.env.WP_AUTH_SECRET;
  if (!secret) return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });

  const incomingSecret = req.headers.get("x-wp-secret");
  if (!incomingSecret || incomingSecret !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, password } = await req.json();
  if (!id || !password) {
    return NextResponse.json({ error: "id와 password를 입력하세요." }, { status: 400 });
  }

  const MAIL_DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "ourim.kr";
  const mailEmail = `${id}@${MAIL_DOMAIN}`;

  const doc = await adminDb.collection("members").doc(mailEmail).get();
  if (!doc.exists) {
    return NextResponse.json({ error: "등록되지 않은 계정입니다." }, { status: 401 });
  }

  const { personalEmail } = doc.data()!;
  if (!personalEmail) {
    return NextResponse.json({ error: "계정 정보 오류. 관리자에게 문의하세요." }, { status: 401 });
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: personalEmail, password, returnSecureToken: false }),
    }
  );
  const body = await res.json() as { error?: { message?: string } };

  if (body.error) {
    const code = body.error.message ?? "UNKNOWN";
    if (code === "USER_DISABLED") {
      return NextResponse.json({ error: "승인 대기 중인 계정입니다." }, { status: 401 });
    }
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
