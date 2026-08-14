import { NextRequest, NextResponse } from "next/server";
import { s3Get } from "@/lib/attachment-storage";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  const res = await s3Get(key);
  if (!res.ok) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const filename = key.split("/").pop() ?? "attachment";
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
