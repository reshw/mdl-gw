import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

async function getMailEmail(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return (decoded.mailEmail as string) ?? decoded.email ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const mailEmail = await getMailEmail(req);
  if (!mailEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await adminDb.collection("tenants").doc(mailEmail).get();
  if (!snap.exists) return NextResponse.json({});

  const d = snap.data()!;
  return NextResponse.json({
    smtp_host: d.smtp_host ?? "",
    smtp_port: d.smtp_port ?? 587,
    smtp_user: d.smtp_user ?? "",
    imap_host: d.imap_host ?? "",
    imap_port: d.imap_port ?? 143,
    imap_user: d.imap_user ?? "",
    firebase_client_config: d.firebase_client_config ?? null,
    share_request: d.share_request ?? null,
  });
}

export async function POST(req: NextRequest) {
  const mailEmail = await getMailEmail(req);
  if (!mailEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const update: Record<string, unknown> = {};
  if (body.smtp_host !== undefined) update.smtp_host = body.smtp_host;
  if (body.smtp_port !== undefined) update.smtp_port = Number(body.smtp_port);
  if (body.smtp_user !== undefined) update.smtp_user = body.smtp_user;
  if (body.imap_host !== undefined) update.imap_host = body.imap_host;
  if (body.imap_port !== undefined) update.imap_port = Number(body.imap_port);
  if (body.imap_user !== undefined) update.imap_user = body.imap_user;
  if (body.firebase_client_config !== undefined) update.firebase_client_config = body.firebase_client_config;

  await adminDb.collection("tenants").doc(mailEmail).set(update, { merge: true });
  return NextResponse.json({ ok: true });
}
