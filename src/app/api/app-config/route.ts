import { NextResponse } from "next/server";

// iOS/모바일 앱이 로그인 전에 이 배포(테넌트)의 Firebase 클라이언트 설정을 받아가는 엔드포인트.
// NEXT_PUBLIC_* 값은 어차피 웹 번들에 공개되는 값이므로 인증 불필요.
export async function GET() {
  return NextResponse.json({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    mailDomain: process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr",
    transport: (process.env.MAIL_TRANSPORT ?? process.env.NEXT_PUBLIC_MAIL_TRANSPORT) === "smtp" ? "smtp" : "resend",
    appName: process.env.NEXT_PUBLIC_APP_NAME ?? "",
  });
}
