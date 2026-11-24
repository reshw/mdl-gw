import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

// 수신자별 차단 목록. 문서 spam_blocks/{수신주소(소문자)} = { addresses: [], domains: [] }.
// 메일 수신 워커(mailer-worker)가 같은 문서를 읽어 차단 발신자의 메일을 spam으로 저장한다.
// 워커는 문서 ID와 필드 이름에 의존하므로 바꿀 때는 워커도 같이 고칠 것.

const MAIL_DOMAIN = (process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "").toLowerCase();
const ADDRESS_RE = /^[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

async function owner(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = ((decoded.mailEmail as string | undefined) ?? decoded.email ?? "").toLowerCase();
    return email || null;
  } catch {
    return null;
  }
}

function blocksDoc(email: string) {
  return adminDb.collection("spam_blocks").doc(email);
}

type Parsed = { field: "addresses" | "domains"; value: string } | { error: string };

function parseValue(raw: unknown, me: string): Parsed {
  const value = String(raw ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!value) return { error: "주소 또는 도메인을 입력하세요." };
  if (value.includes("@")) {
    if (!ADDRESS_RE.test(value)) return { error: "올바른 메일 주소가 아닙니다." };
    if (value === me) return { error: "내 주소는 차단할 수 없습니다." };
    return { field: "addresses", value };
  }
  if (!DOMAIN_RE.test(value)) return { error: "올바른 도메인이 아닙니다." };
  // 우리 도메인을 막으면 같은 회사 사람 메일이 전부 스팸함으로 간다.
  if (MAIL_DOMAIN && (value === MAIL_DOMAIN || MAIL_DOMAIN.endsWith("." + value))) {
    return { error: "우리 회사 도메인은 차단할 수 없습니다." };
  }
  return { field: "domains", value };
}

export async function GET(req: NextRequest) {
  const me = await owner(req);
  if (!me) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  const snap = await blocksDoc(me).get();
  const data = snap.data() ?? {};
  return NextResponse.json({
    addresses: (data.addresses as string[] | undefined) ?? [],
    domains: (data.domains as string[] | undefined) ?? [],
  });
}

export async function POST(req: NextRequest) {
  const me = await owner(req);
  if (!me) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const parsed = parseValue(body.value, me);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await blocksDoc(me).set(
    { [parsed.field]: FieldValue.arrayUnion(parsed.value), updatedAt: new Date().toISOString() },
    { merge: true }
  );
  return NextResponse.json({ ok: true, ...parsed });
}

export async function DELETE(req: NextRequest) {
  const me = await owner(req);
  if (!me) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const value = String(body.value ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!value) return NextResponse.json({ error: "값 없음" }, { status: 400 });
  // 어느 목록에 있든 지운다 — "스팸 아님"은 주소인지 도메인인지 모른 채 호출된다.
  await blocksDoc(me).set(
    {
      addresses: FieldValue.arrayRemove(value),
      domains: FieldValue.arrayRemove(value),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  return NextResponse.json({ ok: true });
}
