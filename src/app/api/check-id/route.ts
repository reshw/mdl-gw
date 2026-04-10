import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

const PROJECT_ID = "emailer-71608";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ available: false });

  const idRegex = /^[a-z0-9]{2,20}$/;
  if (!idRegex.test(id)) return NextResponse.json({ available: false, error: "영문 소문자/숫자 2~20자" });

  // Firestore REST API로 중복 확인
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "signup_requests" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "id" },
              op: "EQUAL",
              value: { stringValue: id },
            },
          },
          limit: 1,
        },
      }),
    }
  );

  const data = await res.json();
  const found = data.some((d: { document?: unknown }) => d.document);
  if (found) return NextResponse.json({ available: false });

  // Firebase Auth 중복 확인
  try {
    await adminAuth.getUserByEmail(`${id}@mdl.kr`);
    return NextResponse.json({ available: false });
  } catch {
    return NextResponse.json({ available: true });
  }
}
