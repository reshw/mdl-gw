"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getSignature, saveSignature } from "@/lib/settings";
import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Eye, EyeOff } from "lucide-react";
import RichEditor from "@/components/RichEditor";

type Tab = "signature" | "password" | "notifications";

export default function SettingsPage() {
  const { user, loading, mailEmail } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("signature");

  // 서명
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 알림
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);

  useEffect(() => {
    if (!user || !auth.currentUser) return;
    getIdToken(auth.currentUser).then(token =>
      fetch("/api/notifications", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setEmailEnabled(d.emailEnabled !== false))
    );
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

  const pwMatch = newPw.length > 0 && newPw === confirmPw;
  const pwReady = currentPw.length > 0 && newPw.length >= 6 && pwMatch;

  return (
    <div className="h-screen flex bg-zinc-50 overflow-hidden">
      {/* 사이드바 */}
      <aside className="w-52 bg-white border-r border-zinc-200 flex flex-col p-4 gap-1">
        <div className="text-sm font-semibold text-zinc-900 mb-4">{process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr"} 메일</div>
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

      </main>
    </div>
  );
}
