import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  let uid: string;
  let mailEmail: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
    mailEmail = decoded.mailEmail as string;
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
  }

  const { otp } = await req.json();
  if (!otp) {
    return NextResponse.json({ error: "인증 코드를 입력해주세요." }, { status: 400 });
  }

  // OTP 문서 조회
  const reqDoc = await adminDb.collection("email_change_requests").doc(uid).get();
  if (!reqDoc.exists) {
    return NextResponse.json({ error: "인증 요청이 없습니다. 다시 시도해주세요." }, { status: 400 });
  }

  const reqData = reqDoc.data()!;

  // 만료 확인
  if (Date.now() > reqData.expiresAtMs) {
    await reqDoc.ref.delete();
    return NextResponse.json({ error: "인증 코드가 만료되었습니다. 다시 시도해주세요." }, { status: 400 });
  }

  // OTP 일치 확인
  if (otp !== reqData.otp) {
    return NextResponse.json({ error: "인증 코드가 올바르지 않습니다." }, { status: 400 });
  }

  const newPersonalEmail: string = reqData.newPersonalEmail;

  // Firebase Auth 이메일 업데이트
  await adminAuth.updateUser(uid, { email: newPersonalEmail });

  // Firestore members 문서 personalEmail 업데이트
  await adminDb.collection("members").doc(mailEmail).update({ personalEmail: newPersonalEmail });

  // OTP 문서 삭제
  await reqDoc.ref.delete();

  return NextResponse.json({ ok: true });
}
