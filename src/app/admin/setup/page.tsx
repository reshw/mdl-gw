"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

const FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /mails/{mailId} {
      allow read, write: if request.auth != null;
    }

    match /drafts/{draftId} {
      allow read, update, delete: if request.auth != null
        && request.auth.token.mailEmail == resource.data.userEmail;
      allow create: if request.auth != null
        && request.auth.token.mailEmail == request.resource.data.userEmail;
    }

    match /labels/{labelId} {
      allow read, update, delete: if request.auth != null
        && request.auth.token.mailEmail == resource.data.userEmail;
      allow create: if request.auth != null
        && request.auth.token.mailEmail == request.resource.data.userEmail;
    }

    match /members/{email} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    match /contacts/{ownerEmail}/personal/{docId} {
      allow read, write: if request.auth != null
        && request.auth.token.email == ownerEmail;
    }

    match /contacts/global/entries/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && request.auth.token.email == "ADMIN_EMAIL";
    }

    match /signup_requests/{docId} {
      allow read, write: if request.auth != null
        && request.auth.token.email == "ADMIN_EMAIL";
    }

    match /tracking/{trackId} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    match /email_change_requests/{uid} {
      allow read, write: if false;
    }
  }
}`;

function envTemplate(domain: string, projectId: string): string {
  const tenantKey = domain.replace(/\./g, "_").toUpperCase();
  return `# =============================================
# ${domain} 배포용 환경변수
# =============================================

NEXT_PUBLIC_MAIL_DOMAIN=${domain}

# ── Firebase ──────────────────────────────────
NEXT_PUBLIC_FIREBASE_API_KEY=              # TODO
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${projectId || "<project-id>"}.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=${projectId || "<project-id>"}
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${projectId || "<project-id>"}.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=  # TODO
NEXT_PUBLIC_FIREBASE_APP_ID=               # TODO
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=       # TODO (선택)

FIREBASE_ADMIN_PROJECT_ID=${projectId || "<project-id>"}
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-fbsvc@${projectId || "<project-id>"}.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"

# ── Cloudflare ────────────────────────────────
CLOUDFLARE_API_TOKEN=                      # TODO
CLOUDFLARE_ACCOUNT_ID=                     # TODO
CF_ZONE_ID=                                # TODO: ${domain} Zone ID
CF_WORKER_NAME=mailer-${domain.split(".")[0]}

# ── Cloudflare R2 ─────────────────────────────
R2_BUCKET=${domain.split(".")[0]}-attachments
R2_ACCESS_KEY_ID=                          # TODO
R2_SECRET_ACCESS_KEY=                      # TODO

# ── Resend ────────────────────────────────────
RESEND_API_KEY=                            # TODO: ${domain} 도메인 인증 후 발급

# ── 관리자 ────────────────────────────────────
ADMIN_EMAIL=reshw@naver.com

# ── 알림 ──────────────────────────────────────
NOTIFY_ENDPOINT=https://${domain}/notify.php
NOTIFY_SECRET=                             # TODO: openssl rand -hex 24

# ── WordPress/MariaDB ─────────────────────────
${tenantKey}_WP_DB_HOST=
${tenantKey}_WP_DB_PORT=3306
${tenantKey}_WP_DB_NAME=
${tenantKey}_WP_TABLE_PREFIX=wp_
${tenantKey}_WP_DB_USER=
${tenantKey}_WP_DB_PASS=

# ── Telegram ──────────────────────────────────
TELEGRAM_BOT_TOKEN=
${tenantKey}_TELEGRAM_CHAT_ID=`;
}

interface Step {
  id: string;
  title: string;
  badge?: string;
  content: React.ReactNode;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 border border-zinc-200 px-2.5 py-1 rounded-lg hover:bg-zinc-50 transition-colors"
    >
      {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
      {copied ? "복사됨" : (label ?? "복사")}
    </button>
  );
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="relative group">
      <pre className="bg-zinc-950 text-zinc-200 text-xs rounded-xl p-4 overflow-x-auto whitespace-pre font-mono leading-5 max-h-72 overflow-y-auto">
        {lang && <span className="absolute top-3 right-3 text-zinc-600 text-[10px] font-mono">{lang}</span>}
        {code}
      </pre>
      <div className="absolute top-2.5 right-2.5">
        <CopyButton text={code} />
      </div>
    </div>
  );
}

function StepCard({ step, open, onToggle }: { step: Step; open: boolean; onToggle: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-900">{step.title}</span>
          {step.badge && (
            <span className="text-[10px] font-medium bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">
              {step.badge}
            </span>
          )}
        </div>
        {open ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-zinc-100 pt-4 space-y-3">
          {step.content}
        </div>
      )}
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return <li className="text-sm text-zinc-700 leading-relaxed">{children}</li>;
}

function Ol({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-700">{children}</ol>;
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-zinc-100 text-zinc-800 text-xs px-1.5 py-0.5 rounded font-mono">{children}</code>;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2 leading-relaxed">
      {children}
    </p>
  );
}

export default function SetupGuidePage() {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [projectId, setProjectId] = useState("");
  const [adminEmail, setAdminEmail] = useState("reshw@naver.com");
  const [openSteps, setOpenSteps] = useState<Set<string>>(new Set(["firebase-project"]));

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [user, loading, isAdmin, router]);

  function toggle(id: string) {
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rulesWithAdmin = FIRESTORE_RULES.replaceAll("ADMIN_EMAIL", adminEmail || "reshw@naver.com");
  const envText = envTemplate(domain || "example.kr", projectId || "");

  const steps: Step[] = [
    {
      id: "firebase-project",
      title: "1. Firebase 프로젝트 생성",
      content: (
        <Ol>
          <Li><a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">Firebase 콘솔</a>에서 새 프로젝트 추가</Li>
          <Li>프로젝트 이름: 예) <Code>{domain ? domain.replace(".", "-") : "example-kr"}</Code></Li>
          <Li>Blaze(종량제) 플랜으로 업그레이드 — Firestore·외부 API 호출에 필요</Li>
          <Li>프로젝트 설정 → 웹 앱 등록 → SDK 설정값 메모</Li>
        </Ol>
      ),
    },
    {
      id: "firestore",
      title: "2. Firestore Database 활성화",
      content: (
        <Ol>
          <Li>Firebase 콘솔 → Firestore Database → 데이터베이스 만들기</Li>
          <Li>시작 모드: <strong>프로덕션 모드</strong> 선택</Li>
          <Li>위치: <Code>asia-northeast3</Code> (서울) 권장</Li>
          <Li>생성 후 아래 보안 규칙 탭에서 규칙 적용</Li>
        </Ol>
      ),
    },
    {
      id: "auth",
      title: "3. Authentication 활성화",
      content: (
        <Ol>
          <Li>Firebase 콘솔 → Authentication → 시작하기</Li>
          <Li>로그인 방법 → <strong>이메일/비밀번호</strong> 사용 설정</Li>
          <Li>승인된 도메인에 <Code>{domain || "example.kr"}</Code> 추가 (배포 후)</Li>
        </Ol>
      ),
    },
    {
      id: "rules",
      title: "4. Firestore 보안 규칙 적용",
      content: (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500 whitespace-nowrap">관리자 이메일:</label>
            <input
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="reshw@naver.com"
              className="flex-1 text-xs border border-zinc-200 rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:border-zinc-400"
            />
          </div>
          <Note>Firebase 콘솔 → Firestore → 규칙 탭에 아래 내용을 붙여넣고 게시</Note>
          <CodeBlock code={rulesWithAdmin} lang="rules" />
        </div>
      ),
    },
    {
      id: "indexes",
      title: "5. Firestore 인덱스",
      badge: "자동생성",
      content: (
        <div className="space-y-2">
          <p className="text-sm text-zinc-700">이 앱은 <strong>단일 필드 쿼리만 사용</strong>하므로 복합 인덱스 수동 생성이 불필요합니다.</p>
          <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-3 space-y-1.5">
            {[
              "mails — where(to == email) 또는 where(from == email)",
              "drafts — where(userEmail == email)",
              "labels — where(userEmail == email)",
              "members — getDocs(collection)",
              "contacts — getDocs(subcollection)",
            ].map((q) => (
              <p key={q} className="text-xs font-mono text-zinc-600">• {q}</p>
            ))}
          </div>
          <Note>향후 복합 정렬(예: where + orderBy)을 추가할 경우 Firebase 콘솔 → Firestore → 색인 탭에서 추가</Note>
        </div>
      ),
    },
    {
      id: "service-account",
      title: "6. 서비스 계정 키 발급",
      content: (
        <Ol>
          <Li>Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 탭</Li>
          <Li><strong>새 비공개 키 생성</strong> → JSON 파일 다운로드</Li>
          <Li>JSON에서 아래 값을 env에 복사:
            <div className="mt-2 space-y-1">
              {[
                ["project_id", "FIREBASE_ADMIN_PROJECT_ID"],
                ["client_email", "FIREBASE_ADMIN_CLIENT_EMAIL"],
                ["private_key", "FIREBASE_ADMIN_PRIVATE_KEY (줄바꿈 \\n 이스케이프)"],
              ].map(([from, to]) => (
                <p key={from} className="text-xs font-mono text-zinc-600 bg-zinc-50 px-2 py-1 rounded">
                  {from} → <span className="text-zinc-900">{to}</span>
                </p>
              ))}
            </div>
          </Li>
          <Li>
            <Code>private_key</Code> 값에서 실제 줄바꿈을 <Code>\n</Code>으로 바꾸고 전체를 큰따옴표로 감싸야 함:
            <div className="mt-1">
              <Code>{`"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"`}</Code>
            </div>
          </Li>
        </Ol>
      ),
    },
    {
      id: "resend",
      title: "7. Resend 도메인 설정",
      content: (
        <Ol>
          <Li><a href="https://resend.com/domains" target="_blank" rel="noreferrer" className="text-blue-600 underline">Resend 콘솔</a> → Domains → Add Domain</Li>
          <Li>도메인 입력: <Code>{domain || "example.kr"}</Code></Li>
          <Li>안내되는 DNS 레코드 4개를 도메인 DNS에 추가:
            <div className="mt-1 space-y-0.5">
              {["SPF (TXT)", "DKIM (TXT × 2)", "RETURN-PATH (CNAME)"].map((r) => (
                <p key={r} className="text-xs text-zinc-600 font-mono">• {r}</p>
              ))}
            </div>
          </Li>
          <Li>도메인 인증 완료 후 API Keys → Create API Key → <Code>RESEND_API_KEY</Code>에 저장</Li>
        </Ol>
      ),
    },
    {
      id: "r2",
      title: "8. Cloudflare R2 버킷 생성",
      content: (
        <Ol>
          <Li>Cloudflare 대시보드 → R2 Object Storage → 버킷 만들기</Li>
          <Li>버킷 이름: <Code>{domain ? `${domain.split(".")[0]}-attachments` : "example-attachments"}</Code></Li>
          <Li>R2 → API → API 토큰 만들기 → 버킷 읽기/쓰기 권한</Li>
          <Li>Access Key ID / Secret Access Key → env에 저장</Li>
          <Li>버킷 CORS 설정 → 아래 origin 허용:
            <div className="mt-1">
              <Code>{`https://${domain || "example.kr"}`}</Code>
            </div>
          </Li>
        </Ol>
      ),
    },
    {
      id: "vercel",
      title: "9. Vercel 프로젝트 연결",
      content: (
        <Ol>
          <Li>Vercel 대시보드 → Add New Project → GitHub repo 선택</Li>
          <Li>Environment Variables에 아래 env 템플릿을 참고해 입력</Li>
          <Li>Domains → 커스텀 도메인 <Code>{domain || "example.kr"}</Code> 추가</Li>
          <Li>DNS: CNAME <Code>{domain ? `gw.${domain}` : "gw.example.kr"}</Code> → <Code>cname.vercel-dns.com</Code></Li>
        </Ol>
      ),
    },
    {
      id: "env-template",
      title: "10. 환경변수 템플릿",
      badge: "복사용",
      content: (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-zinc-500">도메인</label>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.kr"
                className="w-full text-xs border border-zinc-200 rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:border-zinc-400"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-zinc-500">Firebase 프로젝트 ID</label>
              <input
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="example-kr"
                className="w-full text-xs border border-zinc-200 rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:border-zinc-400"
              />
            </div>
          </div>
          <CodeBlock code={envText} lang=".env" />
          <Note>TODO 항목들을 각 서비스 콘솔에서 발급받은 값으로 채우세요. PRIVATE_KEY의 줄바꿈은 \n으로 이스케이프 필요.</Note>
        </div>
      ),
    },
    {
      id: "wp-member-sync",
      title: "11. WordPress 멤버 마이그레이션",
      badge: "선택",
      content: (
        <Ol>
          <Li>WP DB 환경변수 설정 후 /admin 페이지 → <strong>멤버 마이그레이션</strong> 버튼 클릭</Li>
          <Li>wp_users 테이블의 사용자를 Firestore members 컬렉션으로 동기화</Li>
          <Li>이후 새 사용자는 가입 승인 시 자동 추가됨</Li>
        </Ol>
      ),
    },
  ];

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-semibold text-zinc-900">신규 테넌트 설정 가이드</h1>
          <button onClick={() => router.push("/admin")} className="text-sm text-zinc-500 hover:text-zinc-900">
            관리자 페이지로
          </button>
        </div>
        <p className="text-sm text-zinc-500 mb-8">새 도메인/그룹웨어를 추가할 때 순서대로 진행하세요.</p>

        <div className="flex gap-2 mb-6">
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="도메인 입력 (예: newdomain.kr)"
            className="flex-1 text-sm border border-zinc-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-zinc-400 bg-white"
          />
          <input
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="Firebase 프로젝트 ID"
            className="flex-1 text-sm border border-zinc-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-zinc-400 bg-white"
          />
        </div>

        <div className="flex flex-col gap-2">
          {steps.map((step) => (
            <StepCard
              key={step.id}
              step={step}
              open={openSteps.has(step.id)}
              onToggle={() => toggle(step.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
