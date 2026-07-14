import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, assertAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { insertWpUser } from "@/lib/wp-db";

const CF_ZONE_ID = process.env.CF_ZONE_ID ?? "";
const CF_WORKER_NAME = process.env.CF_WORKER_NAME ?? "";

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
    if (!await assertAdmin(token)) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
  }

  const { requestId } = await req.json();

  try {
    const docRef = adminDb.collection("signup_requests").doc(requestId);
    const doc = await docRef.get();
    if (!doc.exists) return NextResponse.json({ error: "요청 없음" }, { status: 404 });

    const { id, name, email: personalEmail, uid } = doc.data()!;

    const MAIL_DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr";
    const email = `${id}@${MAIL_DOMAIN}`;

    // 신청 시 비활성으로 생성된 계정 활성화
    await adminAuth.updateUser(uid, { disabled: false });

    // Cloudflare API 실패는 approve 자체를 막지 않지만(non-fatal), 콘솔 로그만으로는
    // 배포 후 사라지므로 Firestore에도 남겨 나중에 대시보드/점검 스크립트에서 확인 가능하게 한다.
    try {
      await addEmailRoutingRule(email);
      await adminDb.collection("routing_logs").add({
        email,
        action: "add_email_routing_rule",
        success: true,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("이메일 라우팅 규칙 추가 실패 (수동 설정 필요):", msg);
      await adminDb.collection("routing_logs").add({
        email,
        action: "add_email_routing_rule",
        success: false,
        error: msg.slice(0, 1000),
        createdAt: new Date().toISOString(),
      }).catch(() => {});
    }

    await adminDb.collection("members").doc(email).set({
      id,
      email,
      personalEmail: personalEmail ?? "",
      name,
      createdAt: new Date().toISOString(),
    });

    // MariaDB wp_users 동기화 (non-fatal)
    try {
      const randomPass = crypto.randomUUID() + "-" + crypto.randomUUID();
      await insertWpUser({
        userLogin: id,
        userPass: randomPass,
        userEmail: personalEmail ?? "",
        displayName: name,
      });
    } catch (e) {
      console.error("MariaDB wp_users INSERT 실패 (수동 등록 필요):", e instanceof Error ? e.message : e);
    }

    await docRef.update({
      status: "approved",
      password: FieldValue.delete(),
      approvedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("approve error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
