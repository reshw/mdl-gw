import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME
  ?? `${process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr"} 메일`;

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_NAME,
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        {/* 설정에서 고른 UI 폰트를 첫 페인트 전에 적용 — 없으면 기본(Pretendard)이 잠깐
            보였다가 저장된 폰트로 바뀌는 깜빡임이 생긴다. 메일 본문과는 무관한 값이다. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var f=localStorage.getItem("mailer.font");if(f==="lineseed")document.documentElement.setAttribute("data-font",f);}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
