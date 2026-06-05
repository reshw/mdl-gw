import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snap = await adminDb.collection("tenants")
    .where("share_request.status", "==", "pending")
    .get();

  const requests = snap.docs.map((d) => ({
    email: d.id,
    name: d.data().share_request?.name ?? "",
    requestedAt: d.data().share_request?.requestedAt ?? "",
  }));

  return NextResponse.json({ requests });
}
