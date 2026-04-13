import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const ADMIN_EMAIL = "reshw@naver.com";
const CF_ZONE_ID = "de579473b012d58c2fdf7390fb83d130";
const CF_WORKER_NAME = "mailer-worker";

async function addEmailRoutingRule(email: string) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN 없음");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/email/routing/rules`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: email,
        enabled: true,
        matchers: [{ type: "literal", field: "to", value: email }],
        actions: [{ type: "worker", value: [CF_WORKER_NAME] }],
      }),
    }
  );

  if (!res.ok) {
    const body = await res.json();
    throw new Error(JSON.stringify(body));
  }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
  }

  const { requestId } = await req.json();

  const docRef = adminDb.collection("signup_requests").doc(requestId);
  const doc = await docRef.get();
  if (!doc.exists) return NextResponse.json({ error: "요청 없음" }, { status: 404 });

  const { id, name, password } = doc.data()!;

  const email = `${id}@mdl.kr`;

  await adminAuth.createUser({
    email,
    password,
    displayName: name,
  });

  await addEmailRoutingRule(email);

  await adminDb.collection("members").doc(email).set({
    email,
    name,
    createdAt: new Date().toISOString(),
  });

  await docRef.update({
    status: "approved",
    password: FieldValue.delete(),
    approvedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, email });
}
