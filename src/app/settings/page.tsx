"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getSignature, saveSignature } from "@/lib/settings";
import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Eye, EyeOff, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import RichEditor from "@/components/RichEditor";
import {
  subscribeRules, createRule, updateRule, deleteRule, applyRulesToAllMails,
  type MailRule, type RuleCondition, type RuleAction, type ConditionField, type ConditionOperator, type ActionType,
} from "@/lib/rules";
import { subscribeLabels, type Label } from "@/lib/labels";

type Tab = "signature" | "password" | "notifications" | "account" | "connection" | "rules";
const USE_SMTP = process.env.NEXT_PUBLIC_MAIL_TRANSPORT === "smtp";

export default function SettingsPage() {
  const { user, loading, mailEmail } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("signature");

  // 서명
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 계정 (personalEmail 변경)
  const [personalEmail, setPersonalEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailChangePw, setEmailChangePw] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [emailChangeLoading, setEmailChangeLoading] = useState(false);
  const [emailChangeMsg, setEmailChangeMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // 알림
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);

  // 분류 규칙
  const [rules, setRules] = useState<MailRule[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [ruleModal, setRuleModal] = useState<{ mode: "create" | "edit"; rule: Omit<MailRule, "id" | "userEmail" | "createdAt" | "order"> & { id?: string } } | null>(null);
  const [ruleBackfill, setRuleBackfill] = useState(false);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleMsg, setRuleMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // 연결 설정 (SMTP 모드)
  const [conn, setConn] = useState({
    smtp_host: "", smtp_port: "587", smtp_user: "", smtp_pass: "",
    smtp_secure: "starttls",
    imap_host: "", imap_port: "143", imap_user: "", imap_pass: "",
    fb_apiKey: "", fb_authDomain: "", fb_projectId: "",
    fb_storageBucket: "", fb_messagingSenderId: "", fb_appId: "",
  });
  const [connLoading, setConnLoading] = useState(false);
  const [connSaved, setConnSaved] = useState(false);
  const [connMsg, setConnMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [shareRequest, setShareRequest] = useState<{ status: string; name?: string } | null>(null);
  const [shareName, setShareName] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareMsg, setShareMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!user || !auth.currentUser) return;
    getIdToken(auth.currentUser).then(token => {
      fetch("/api/notifications", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setEmailEnabled(d.emailEnabled !== false));
      if (USE_SMTP) {
        fetch("/api/tenant-settings", { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json())
          .then(d => {
            const fb = d.firebase_client_config ?? {};
            setConn({
              smtp_host: d.smtp_host ?? "", smtp_port: String(d.smtp_port ?? 587),
              smtp_user: d.smtp_user ?? "", smtp_pass: "",
              smtp_secure: d.smtp_secure === true ? "ssl" : "starttls",
              imap_host: d.imap_host ?? "", imap_port: String(d.imap_port ?? 143),
              imap_user: d.imap_user ?? "", imap_pass: "",
              fb_apiKey: fb.apiKey ?? "", fb_authDomain: fb.authDomain ?? "",
              fb_projectId: fb.projectId ?? "", fb_storageBucket: fb.storageBucket ?? "",
              fb_messagingSenderId: fb.messagingSenderId ?? "", fb_appId: fb.appId ?? "",
            });
            if (d.share_request) setShareRequest(d.share_request);
          });
      }
    });
    if (auth.currentUser.email) setPersonalEmail(auth.currentUser.email);
  }, [user]);

  async function handleNotifSave(enabled: boolean) {
    if (!auth.currentUser) return;
    setNotifSaving(true);
    try {
      const token = await getIdToken(auth.currentUser);
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ emailEnabled: enabled }),
      });
      setEmailEnabled(enabled);
    } finally {
      setNotifSaving(false);
    }
  }

  // 비밀번호
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getSignature().then(setSignature);
  }, [user]);

  useEffect(() => {
    if (!mailEmail) return;
    const u1 = subscribeRules(mailEmail, setRules);
    const u2 = subscribeLabels(mailEmail, setLabels);
    return () => { u1(); u2(); };
  }, [mailEmail]);

  if (loading || !user) return null;

  async function handleSaveSignature() {
    setSaving(true);
    try {
      await saveSignature(signature);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordChange() {
    if (!auth.currentUser) return;
    setPwSaving(true);
    setPwMsg(null);
    try {
      const token = await getIdToken(auth.currentUser);
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwMsg({ text: data.error, ok: false });
      } else {
        setPwMsg({ text: "비밀번호가 변경되었습니다.", ok: true });
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
      }
    } finally {
      setPwSaving(false);
    }
  }

  async function handleConnSave() {
    if (!auth.currentUser) return;
    setConnLoading(true);
    setConnMsg(null);
    try {
      const token = await getIdToken(auth.currentUser);
      const body: Record<string, unknown> = {
        smtp_host: conn.smtp_host, smtp_port: conn.smtp_port,
        smtp_secure: conn.smtp_secure === "ssl",
        smtp_user: conn.smtp_user,
        imap_host: conn.imap_host, imap_port: conn.imap_port,
        imap_user: conn.imap_user,
      };
      if (conn.fb_projectId) {
        body.firebase_client_config = {
          apiKey: conn.fb_apiKey, authDomain: conn.fb_authDomain,
          projectId: conn.fb_projectId, storageBucket: conn.fb_storageBucket,
          messagingSenderId: conn.fb_messagingSenderId, appId: conn.fb_appId,
        };
      }
      const res = await fetch("/api/tenant-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setConnMsg({ text: "저장되었습니다. 재로그인하면 적용됩니다.", ok: true });
      } else {
        setConnMsg({ text: "저장 실패", ok: false });
      }
    } finally {
      setConnLoading(false);
    }
  }

  const pwMatch = newPw.length > 0 && newPw === confirmPw;
  const pwReady = currentPw.length > 0 && newPw.length >= 6 && pwMatch;

  async function handleShareRequest() {
    if (!auth.currentUser || !shareName.trim()) return;
    setShareLoading(true);
    setShareMsg(null);
    try {
      const token = await getIdToken(auth.currentUser);
      const res = await fetch("/api/share-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: shareName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setShareMsg({ text: data.error, ok: false });
      } else {
        setShareRequest({ status: "pending", name: shareName.trim() });
        setShareMsg({ text: "신청이 접수되었습니다. 관리자 승인 후 이용 가능합니다.", ok: true });
      }
    } finally {
      setShareLoading(false);
    }
  }

  async function handleRequestEmailChange() {
    if (!auth.currentUser) return;
    setEmailChangeLoading(true);
    setEmailChangeMsg(null);
    try {
      const token = await getIdToken(auth.currentUser);
      const res = await fetch("/api/auth/request-email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newEmail, currentPassword: emailChangePw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailChangeMsg({ text: data.error, ok: false });
      } else {
        setOtpSent(true);
        setEmailChangeMsg({ text: `${newEmail}으로 인증 코드를 발송했습니다.`, ok: true });
      }
    } finally {
      setEmailChangeLoading(false);
    }
  }

  async function handleConfirmEmailChange() {
    if (!auth.currentUser) return;
    setEmailChangeLoading(true);
    setEmailChangeMsg(null);
    try {
      const token = await getIdToken(auth.currentUser);
      const res = await fetch("/api/auth/confirm-email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailChangeMsg({ text: data.error, ok: false });
      } else {
        setPersonalEmail(newEmail);
        setNewEmail("");
        setEmailChangePw("");
        setOtp("");
        setOtpSent(false);
        setEmailChangeMsg({ text: "알림 이메일이 변경되었습니다.", ok: true });
      }
    } finally {
      setEmailChangeLoading(false);
    }
  }

  return (
    <div className="h-screen flex bg-zinc-50 overflow-hidden">
      {/* 사이드바 */}
      <aside className="w-52 bg-white border-r border-zinc-200 flex flex-col p-4 gap-1">
        <div className="text-sm font-semibold text-zinc-900 mb-4">{process.env.NEXT_PUBLIC_APP_NAME ?? `${process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr"} 메일`}</div>
        <button
          onClick={() => router.push("/mail")}
          className="text-left text-sm px-3 py-2 rounded-lg text-zinc-600 hover:bg-zinc-50"
        >
          ← 메일함으로
        </button>
        <div className="h-px bg-zinc-100 my-1" />
        <button
          onClick={() => setTab("signature")}
          className={`text-left text-sm px-3 py-2 rounded-lg ${tab === "signature" ? "bg-zinc-100 text-zinc-900 font-medium" : "text-zinc-600 hover:bg-zinc-50"}`}
        >
          메일 서명
        </button>
        <button
          onClick={() => setTab("password")}
          className={`text-left text-sm px-3 py-2 rounded-lg ${tab === "password" ? "bg-zinc-100 text-zinc-900 font-medium" : "text-zinc-600 hover:bg-zinc-50"}`}
        >
          비밀번호 변경
        </button>
        <button
          onClick={() => setTab("notifications")}
          className={`text-left text-sm px-3 py-2 rounded-lg ${tab === "notifications" ? "bg-zinc-100 text-zinc-900 font-medium" : "text-zinc-600 hover:bg-zinc-50"}`}
        >
          알림
        </button>
        <button
          onClick={() => setTab("account")}
          className={`text-left text-sm px-3 py-2 rounded-lg ${tab === "account" ? "bg-zinc-100 text-zinc-900 font-medium" : "text-zinc-600 hover:bg-zinc-50"}`}
        >
          계정
        </button>
        <button
          onClick={() => setTab("rules")}
          className={`text-left text-sm px-3 py-2 rounded-lg ${tab === "rules" ? "bg-zinc-100 text-zinc-900 font-medium" : "text-zinc-600 hover:bg-zinc-50"}`}
        >
          분류 규칙
        </button>
        {USE_SMTP && (
          <button
            onClick={() => setTab("connection")}
            className={`text-left text-sm px-3 py-2 rounded-lg ${tab === "connection" ? "bg-zinc-100 text-zinc-900 font-medium" : "text-zinc-600 hover:bg-zinc-50"}`}
          >
            연결 설정
          </button>
        )}
        <div className="flex-1" />
        <div className="text-xs text-zinc-500 truncate">{mailEmail}</div>
      </aside>

      {/* 본문 */}
      <main className="flex-1 overflow-y-auto p-8">

        {tab === "signature" && (
          <>
            <h1 className="text-lg font-semibold text-zinc-900 mb-6">메일 서명</h1>
            <section className="bg-white rounded-2xl border border-zinc-200 p-6 max-w-2xl">
              <p className="text-xs text-zinc-400 mb-4">메일 작성 시 본문 하단에 자동으로 삽입됩니다.</p>
              <div className="border border-zinc-200 rounded-xl overflow-hidden mb-4">
                <RichEditor value={signature} onChange={setSignature} />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveSignature}
                  disabled={saving}
                  className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
                {saved && <span className="text-xs text-zinc-400">저장되었습니다.</span>}
              </div>
            </section>
          </>
        )}

        {tab === "password" && (
          <>
            <h1 className="text-lg font-semibold text-zinc-900 mb-6">비밀번호 변경</h1>
            <section className="bg-white rounded-2xl border border-zinc-200 p-6 max-w-sm">
              <div className="flex flex-col gap-3">
                {/* 현재 비밀번호 */}
                <div className="relative">
                  <input
                    type={showCurrent ? "text" : "password"}
                    placeholder="현재 비밀번호"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 pr-10 text-sm text-black outline-none focus:border-zinc-400"
                  />
                  <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <div className="h-px bg-zinc-100" />

                {/* 새 비밀번호 */}
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    placeholder="새 비밀번호 (6자 이상)"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 pr-10 text-sm text-black outline-none focus:border-zinc-400"
                  />
                  <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* 비밀번호 확인 */}
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    placeholder="새 비밀번호 확인"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    className={`w-full rounded-lg border px-4 py-2.5 pr-10 text-sm text-black outline-none focus:border-zinc-400 ${
                      confirmPw.length > 0
                        ? pwMatch ? "border-green-300" : "border-red-300"
                        : "border-zinc-200"
                    }`}
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirmPw.length > 0 && (
                  <p className={`text-xs -mt-1 ${pwMatch ? "text-green-500" : "text-red-400"}`}>
                    {pwMatch ? "일치합니다." : "비밀번호가 일치하지 않습니다."}
                  </p>
                )}

                <div className="flex items-center gap-3 mt-1">
                  <button
                    onClick={handlePasswordChange}
                    disabled={pwSaving || !pwReady}
                    className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {pwSaving ? "변경 중..." : "변경"}
                  </button>
                  {pwMsg && <span className={`text-xs ${pwMsg.ok ? "text-zinc-400" : "text-red-500"}`}>{pwMsg.text}</span>}
                </div>
              </div>
            </section>
          </>
        )}

        {tab === "notifications" && (
          <>
            <h1 className="text-lg font-semibold text-zinc-900 mb-6">알림</h1>
            <section className="bg-white rounded-2xl border border-zinc-200 p-6 max-w-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-900">이메일 알림</p>
                  <p className="text-xs text-zinc-400 mt-0.5">새 메일 수신 시 개인 이메일로 알림 발송</p>
                </div>
                <button
                  onClick={() => handleNotifSave(!emailEnabled)}
                  disabled={notifSaving}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${emailEnabled ? "bg-zinc-900" : "bg-zinc-200"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${emailEnabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </section>
          </>
        )}

        {tab === "account" && (
          <>
            <h1 className="text-lg font-semibold text-zinc-900 mb-6">계정</h1>
            <section className="bg-white rounded-2xl border border-zinc-200 p-6 max-w-sm">
              <p className="text-xs text-zinc-400 mb-1">현재 알림 이메일</p>
              <p className="text-sm text-zinc-900 font-medium mb-6">{personalEmail || "—"}</p>

              {!otpSent ? (
                <div className="flex flex-col gap-3">
                  <input
                    type="email"
                    placeholder="새 이메일 주소"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 text-sm text-black outline-none focus:border-zinc-400"
                  />
                  <input
                    type="password"
                    placeholder="현재 비밀번호"
                    value={emailChangePw}
                    onChange={(e) => setEmailChangePw(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 text-sm text-black outline-none focus:border-zinc-400"
                  />
                  <div className="flex items-center gap-3 mt-1">
                    <button
                      onClick={handleRequestEmailChange}
                      disabled={emailChangeLoading || !newEmail || !emailChangePw}
                      className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {emailChangeLoading ? "발송 중..." : "인증 코드 발송"}
                    </button>
                    {emailChangeMsg && (
                      <span className={`text-xs ${emailChangeMsg.ok ? "text-zinc-400" : "text-red-500"}`}>
                        {emailChangeMsg.text}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-zinc-500">{newEmail}으로 인증 코드를 발송했습니다. (10분 이내 입력)</p>
                  <input
                    type="text"
                    placeholder="인증 코드 6자리"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 text-sm text-black outline-none focus:border-zinc-400 tracking-widest"
                    maxLength={6}
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleConfirmEmailChange}
                      disabled={emailChangeLoading || otp.length !== 6}
                      className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {emailChangeLoading ? "확인 중..." : "변경 완료"}
                    </button>
                    <button
                      onClick={() => { setOtpSent(false); setOtp(""); setEmailChangeMsg(null); }}
                      className="text-xs text-zinc-400 hover:text-zinc-600"
                    >
                      다시 시도
                    </button>
                    {emailChangeMsg && (
                      <span className={`text-xs ${emailChangeMsg.ok ? "text-zinc-400" : "text-red-500"}`}>
                        {emailChangeMsg.text}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {tab === "rules" && (
          <>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-lg font-semibold text-zinc-900">분류 규칙</h1>
              <button
                onClick={() => setRuleModal({
                  mode: "create",
                  rule: { name: "", enabled: true, conditionLogic: "AND", conditions: [{ field: "from", operator: "contains", value: "" }], actions: [{ type: "addLabel" }] },
                })}
                className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                <Plus size={14} /> 규칙 추가
              </button>
            </div>

            {rules.length === 0 ? (
              <div className="bg-white rounded-2xl border border-zinc-200 p-8 max-w-2xl text-center text-sm text-zinc-400">
                아직 분류 규칙이 없어요. 규칙을 추가하면 새 메일에 자동 적용됩니다.
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-w-2xl">
                {rules.map((rule) => (
                  <div key={rule.id} className="bg-white rounded-2xl border border-zinc-200 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${rule.enabled ? "bg-zinc-900" : "bg-zinc-200"}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${rule.enabled ? "translate-x-4.5" : "translate-x-0.5"}`} />
                        </button>
                        <span className="text-sm font-medium text-zinc-900">{rule.name || "(이름 없음)"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setRuleModal({ mode: "edit", rule: { ...rule } })}
                          className="text-xs text-zinc-400 hover:text-zinc-700 px-2 py-1 rounded hover:bg-zinc-50"
                        >
                          편집
                        </button>
                        <button
                          onClick={() => deleteRule(rule.id)}
                          className="text-zinc-300 hover:text-red-400 p-1 rounded hover:bg-zinc-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-zinc-400 flex flex-wrap gap-1">
                      {rule.conditions.map((c, i) => (
                        <span key={i} className="bg-zinc-50 border border-zinc-200 rounded px-2 py-0.5">
                          {c.field} {c.operator} "{c.value}"
                        </span>
                      ))}
                      <span className="text-zinc-300">→</span>
                      {rule.actions.map((a, i) => (
                        <span key={i} className="bg-blue-50 border border-blue-200 text-blue-700 rounded px-2 py-0.5">
                          {a.type === "addLabel" ? `라벨: ${labels.find(l => l.id === a.labelId)?.name ?? a.labelId}` : a.type === "markRead" ? "읽음 처리" : "휴지통"}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 규칙 추가/편집 모달 */}
            {ruleModal && (
              <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                  <h2 className="text-base font-semibold text-zinc-900 mb-4">
                    {ruleModal.mode === "create" ? "규칙 추가" : "규칙 편집"}
                  </h2>

                  {/* 규칙 이름 */}
                  <div className="mb-4">
                    <label className="text-xs text-zinc-500 mb-1 block">규칙 이름</label>
                    <input
                      type="text"
                      placeholder="예: 뉴스레터 자동 분류"
                      value={ruleModal.rule.name}
                      onChange={(e) => setRuleModal(m => m ? { ...m, rule: { ...m.rule, name: e.target.value } } : m)}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-black outline-none focus:border-zinc-400"
                    />
                  </div>

                  {/* 조건 */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-zinc-500">조건</label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400">조건 결합:</span>
                        <select
                          value={ruleModal.rule.conditionLogic}
                          onChange={(e) => setRuleModal(m => m ? { ...m, rule: { ...m.rule, conditionLogic: e.target.value as "AND" | "OR" } } : m)}
                          className="text-xs rounded border border-zinc-200 px-2 py-1 text-zinc-700 outline-none"
                        >
                          <option value="AND">모두 충족 (AND)</option>
                          <option value="OR">하나라도 충족 (OR)</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {ruleModal.rule.conditions.map((cond, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <select
                            value={cond.field}
                            onChange={(e) => setRuleModal(m => {
                              if (!m) return m;
                              const conditions = [...m.rule.conditions];
                              conditions[i] = { ...conditions[i], field: e.target.value as ConditionField };
                              return { ...m, rule: { ...m.rule, conditions } };
                            })}
                            className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm text-black outline-none focus:border-zinc-400"
                          >
                            <option value="from">보낸 사람</option>
                            <option value="to">받는 사람</option>
                            <option value="subject">제목</option>
                            <option value="text">본문</option>
                          </select>
                          <select
                            value={cond.operator}
                            onChange={(e) => setRuleModal(m => {
                              if (!m) return m;
                              const conditions = [...m.rule.conditions];
                              conditions[i] = { ...conditions[i], operator: e.target.value as ConditionOperator };
                              return { ...m, rule: { ...m.rule, conditions } };
                            })}
                            className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm text-black outline-none focus:border-zinc-400"
                          >
                            <option value="contains">포함</option>
                            <option value="equals">일치</option>
                            <option value="startsWith">시작</option>
                            <option value="endsWith">끝</option>
                          </select>
                          <input
                            type="text"
                            placeholder="값"
                            value={cond.value}
                            onChange={(e) => setRuleModal(m => {
                              if (!m) return m;
                              const conditions = [...m.rule.conditions];
                              conditions[i] = { ...conditions[i], value: e.target.value };
                              return { ...m, rule: { ...m.rule, conditions } };
                            })}
                            className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-black outline-none focus:border-zinc-400"
                          />
                          {ruleModal.rule.conditions.length > 1 && (
                            <button
                              onClick={() => setRuleModal(m => {
                                if (!m) return m;
                                return { ...m, rule: { ...m.rule, conditions: m.rule.conditions.filter((_, ci) => ci !== i) } };
                              })}
                              className="text-zinc-300 hover:text-red-400"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setRuleModal(m => m ? { ...m, rule: { ...m.rule, conditions: [...m.rule.conditions, { field: "from", operator: "contains", value: "" }] } } : m)}
                      className="mt-2 text-xs text-zinc-400 hover:text-zinc-700 flex items-center gap-1"
                    >
                      <Plus size={12} /> 조건 추가
                    </button>
                  </div>

                  {/* 액션 */}
                  <div className="mb-5">
                    <label className="text-xs text-zinc-500 mb-2 block">실행할 작업</label>
                    <div className="flex flex-col gap-2">
                      {ruleModal.rule.actions.map((action, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <select
                            value={action.type}
                            onChange={(e) => setRuleModal(m => {
                              if (!m) return m;
                              const actions = [...m.rule.actions];
                              actions[i] = { type: e.target.value as ActionType };
                              return { ...m, rule: { ...m.rule, actions } };
                            })}
                            className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm text-black outline-none focus:border-zinc-400"
                          >
                            <option value="addLabel">라벨 추가</option>
                            <option value="markRead">읽음 처리</option>
                            <option value="moveToTrash">휴지통으로</option>
                          </select>
                          {action.type === "addLabel" && (
                            <select
                              value={action.labelId ?? ""}
                              onChange={(e) => setRuleModal(m => {
                                if (!m) return m;
                                const actions = [...m.rule.actions];
                                actions[i] = { ...actions[i], labelId: e.target.value };
                                return { ...m, rule: { ...m.rule, actions } };
                              })}
                              className="flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm text-black outline-none focus:border-zinc-400"
                            >
                              <option value="">라벨 선택</option>
                              {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                          )}
                          {ruleModal.rule.actions.length > 1 && (
                            <button
                              onClick={() => setRuleModal(m => m ? { ...m, rule: { ...m.rule, actions: m.rule.actions.filter((_, ai) => ai !== i) } } : m)}
                              className="text-zinc-300 hover:text-red-400"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setRuleModal(m => m ? { ...m, rule: { ...m.rule, actions: [...m.rule.actions, { type: "addLabel" }] } } : m)}
                      className="mt-2 text-xs text-zinc-400 hover:text-zinc-700 flex items-center gap-1"
                    >
                      <Plus size={12} /> 작업 추가
                    </button>
                  </div>

                  {/* 소급 적용 */}
                  <label className="flex items-center gap-2 mb-5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ruleBackfill}
                      onChange={(e) => setRuleBackfill(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm text-zinc-600">기존 메일에도 적용</span>
                  </label>

                  {ruleMsg && (
                    <p className={`text-xs mb-3 ${ruleMsg.ok ? "text-zinc-400" : "text-red-500"}`}>{ruleMsg.text}</p>
                  )}

                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setRuleModal(null); setRuleMsg(null); setRuleBackfill(false); }}
                      className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 rounded-lg hover:bg-zinc-50"
                    >
                      취소
                    </button>
                    <button
                      disabled={ruleSaving}
                      onClick={async () => {
                        if (!mailEmail) return;
                        setRuleSaving(true);
                        setRuleMsg(null);
                        try {
                          let ruleId: string;
                          if (ruleModal.mode === "create") {
                            ruleId = await createRule(mailEmail, ruleModal.rule);
                          } else {
                            ruleId = ruleModal.rule.id!;
                            await updateRule(ruleId, ruleModal.rule);
                          }
                          if (ruleBackfill) {
                            const savedRule = { ...ruleModal.rule, id: ruleId, userEmail: mailEmail, createdAt: "", order: 0 } as MailRule;
                            const count = await applyRulesToAllMails(mailEmail, [savedRule]);
                            setRuleMsg({ text: `저장 완료. 기존 메일 ${count}건에 적용했습니다.`, ok: true });
                          } else {
                            setRuleMsg({ text: "저장되었습니다.", ok: true });
                          }
                          setTimeout(() => { setRuleModal(null); setRuleMsg(null); setRuleBackfill(false); }, 1200);
                        } catch (e) {
                          setRuleMsg({ text: "저장 실패: " + String(e), ok: false });
                        } finally {
                          setRuleSaving(false);
                        }
                      }}
                      className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {ruleSaving ? "저장 중..." : "저장"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "connection" && USE_SMTP && (
          <>
            <h1 className="text-lg font-semibold text-zinc-900 mb-6">연결 설정</h1>

            {/* SMTP */}
            <section className="bg-white rounded-2xl border border-zinc-200 p-6 max-w-lg mb-4">
              <h2 className="text-sm font-semibold text-zinc-700 mb-4">발송 서버 (SMTP)</h2>
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input placeholder="SMTP 호스트" value={conn.smtp_host} onChange={e => setConn(c => ({ ...c, smtp_host: e.target.value }))}
                    className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-black outline-none focus:border-zinc-400" />
                  <input placeholder="포트" value={conn.smtp_port} onChange={e => setConn(c => ({ ...c, smtp_port: e.target.value }))}
                    className="w-20 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-black outline-none focus:border-zinc-400" />
                </div>
                <select value={conn.smtp_secure} onChange={e => setConn(c => ({ ...c, smtp_secure: e.target.value }))}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-black outline-none focus:border-zinc-400">
                  <option value="starttls">STARTTLS (포트 587 권장)</option>
                  <option value="ssl">SSL/TLS (포트 465)</option>
                  <option value="none">암호화 없음 (포트 25)</option>
                </select>
                <input placeholder="SMTP 사용자 (이메일)" value={conn.smtp_user} onChange={e => setConn(c => ({ ...c, smtp_user: e.target.value }))}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-black outline-none focus:border-zinc-400" />
                <p className="text-xs text-zinc-400">비밀번호는 로그인 비밀번호와 동일하게 유지됩니다. 메일 서버 비밀번호가 바뀐 경우 비밀번호 변경 메뉴에서 변경하세요.</p>
              </div>
            </section>

            {/* IMAP */}
            <section className="bg-white rounded-2xl border border-zinc-200 p-6 max-w-lg mb-4">
              <h2 className="text-sm font-semibold text-zinc-700 mb-4">수신 서버 (IMAP / EmailArchiver 참조용)</h2>
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input placeholder="IMAP 호스트" value={conn.imap_host} onChange={e => setConn(c => ({ ...c, imap_host: e.target.value }))}
                    className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-black outline-none focus:border-zinc-400" />
                  <input placeholder="포트" value={conn.imap_port} onChange={e => setConn(c => ({ ...c, imap_port: e.target.value }))}
                    className="w-20 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-black outline-none focus:border-zinc-400" />
                </div>
                <input placeholder="IMAP 사용자 (이메일)" value={conn.imap_user} onChange={e => setConn(c => ({ ...c, imap_user: e.target.value }))}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-black outline-none focus:border-zinc-400" />
                <p className="text-xs text-zinc-400">비밀번호는 로그인 비밀번호와 동일하게 유지됩니다. 메일 서버 비밀번호가 바뀐 경우 비밀번호 변경 메뉴에서 변경하세요.</p>
              </div>
            </section>

            {/* Firebase */}
            <section className="bg-white rounded-2xl border border-zinc-200 p-6 max-w-lg mb-6">
              <h2 className="text-sm font-semibold text-zinc-700 mb-1">개인 Firebase 설정</h2>
              <p className="text-xs text-zinc-400 mb-4">메일 데이터가 저장되는 본인 Firebase 프로젝트 정보</p>
              <div className="flex flex-col gap-3">
                <input placeholder="API Key" value={conn.fb_apiKey} onChange={e => setConn(c => ({ ...c, fb_apiKey: e.target.value }))}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-black outline-none focus:border-zinc-400" />
                <input placeholder="Auth Domain (xxx.firebaseapp.com)" value={conn.fb_authDomain} onChange={e => setConn(c => ({ ...c, fb_authDomain: e.target.value }))}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-black outline-none focus:border-zinc-400" />
                <input placeholder="Project ID" value={conn.fb_projectId} onChange={e => setConn(c => ({ ...c, fb_projectId: e.target.value }))}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-black outline-none focus:border-zinc-400" />
                <input placeholder="Storage Bucket" value={conn.fb_storageBucket} onChange={e => setConn(c => ({ ...c, fb_storageBucket: e.target.value }))}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-black outline-none focus:border-zinc-400" />
                <input placeholder="Messaging Sender ID" value={conn.fb_messagingSenderId} onChange={e => setConn(c => ({ ...c, fb_messagingSenderId: e.target.value }))}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-black outline-none focus:border-zinc-400" />
                <input placeholder="App ID" value={conn.fb_appId} onChange={e => setConn(c => ({ ...c, fb_appId: e.target.value }))}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-black outline-none focus:border-zinc-400" />
              </div>
            </section>

            <div className="flex items-center gap-3">
              <button
                onClick={handleConnSave}
                disabled={connLoading}
                className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {connLoading ? "저장 중..." : "저장"}
              </button>
              {connMsg && <span className={`text-xs ${connMsg.ok ? "text-zinc-400" : "text-red-500"}`}>{connMsg.text}</span>}
            </div>

            {/* 같이쓰기 신청 */}
            {!conn.fb_projectId && (
              <section className="bg-zinc-50 rounded-2xl border border-zinc-200 p-6 max-w-lg mt-2">
                <h2 className="text-sm font-semibold text-zinc-700 mb-1">같이쓰기 신청</h2>
                <p className="text-xs text-zinc-400 mb-4">개인 Firebase 없이 공유 저장소 사용을 관리자에게 신청합니다.</p>
                {shareRequest?.status === "pending" ? (
                  <p className="text-sm text-zinc-500">신청 접수 완료 — 관리자 승인 대기 중입니다.</p>
                ) : shareRequest?.status === "approved" ? (
                  <p className="text-sm text-zinc-500">승인되었습니다. 재로그인하면 적용됩니다.</p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="이름 (예: 양석환)"
                      value={shareName}
                      onChange={(e) => setShareName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleShareRequest(); }}
                      className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-black outline-none focus:border-zinc-400 bg-white"
                    />
                    <button
                      onClick={handleShareRequest}
                      disabled={shareLoading || !shareName.trim()}
                      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {shareLoading ? "신청 중..." : "신청"}
                    </button>
                  </div>
                )}
                {shareMsg && (
                  <p className={`text-xs mt-2 ${shareMsg.ok ? "text-zinc-400" : "text-red-500"}`}>{shareMsg.text}</p>
                )}
              </section>
            )}
          </>
        )}

      </main>
    </div>
  );
}
