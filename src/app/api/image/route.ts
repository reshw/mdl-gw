import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { s3Get, s3Put } from "@/lib/attachment-storage";

// 이미지 업로드 (인증 필요)
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const token = formData.get("token") as string;
  const file = formData.get("files[0]") as File ?? formData.get("files[]") as File;

  if (!token || !file) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  try {
    await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const key = `images/${crypto.randomUUID()}.${ext}`;
  const buffer = await file.arrayBuffer();

  await s3Put(key, buffer, file.type || "image/png");

  const url = `/api/image?key=${encodeURIComponent(key)}`;
  return NextResponse.json({ files: [url], path: "", baseurl: "", error: 0, msg: "ok" });
}

// 이미지 서빙 (공개 — 수신자도 로딩 가능)
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  const res = await s3Get(key);
  if (!res.ok) return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });

  const contentType = res.headers.get("content-type") ?? "image/png";
  return new NextResponse(res.body, {
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000" },
  });
}
