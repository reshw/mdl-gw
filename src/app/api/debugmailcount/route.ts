import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

// 임시 진단용 — 확인 후 즉시 삭제할 것.
export async function GET() {
  const snap = await adminDb.collection("mails").limit(5).get();
  const total = await adminDb.collection("mails").count().get();
  return NextResponse.json({
    totalCount: total.data().count,
    sample: snap.docs.map((d) => ({
      id: d.id,
      deliveredTo: d.data().deliveredTo,
      from: d.data().from,
      subject: d.data().subject,
      type: d.data().type ?? null,
      createdAt: d.data().createdAt,
    })),
  });
}
