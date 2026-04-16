"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getSignature, saveSignature } from "@/lib/settings";
import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import RichEditor from "@/components/RichEditor";

export default function SettingsPage() {
  const { user, loading, mailEmail } = useAuth();
  const router = useRouter();
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
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

  async function handleSave() {
    if (!user?.email) return;
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
      }
    } finally {
      setPwSaving(false);
    }
  }

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
        <div className="flex-1" />
        <div className="text-xs text-zinc-500 truncate">{mailEmail}</div>
      </aside>

      {/* 본문 */}
      <main className="flex-1 overflow-y-auto p-8">
        <h1 className="text-lg font-semibold text-zinc-900 mb-6">설정</h1>

        <section className="bg-white rounded-2xl border border-zinc-200 p-6 max-w-2xl">
          <h2 className="text-sm font-semibold text-zinc-900 mb-1">메일 서명</h2>
          <p className="text-xs text-zinc-400 mb-4">메일 작성 시 본문 하단에 자동으로 삽입됩니다.</p>
          <div className="border border-zinc-200 rounded-xl overflow-hidden mb-4">
            <RichEditor value={signature} onChange={setSignature} />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            {saved && <span className="text-xs text-zinc-400">저장되었습니다.</span>}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-zinc-200 p-6 max-w-2xl mt-6">
          <h2 className="text-sm font-semibold text-zinc-900 mb-1">비밀번호 변경</h2>
          <p className="text-xs text-zinc-400 mb-4">현재 비밀번호를 확인 후 새 비밀번호로 변경합니다.</p>
          <div className="flex flex-col gap-3">
            <input
              type="password"
              placeholder="현재 비밀번호"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 text-sm text-black outline-none focus:border-zinc-400"
            />
            <input
              type="password"
              placeholder="새 비밀번호 (6자 이상)"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 text-sm text-black outline-none focus:border-zinc-400"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handlePasswordChange}
                disabled={pwSaving || !currentPw || !newPw}
                className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pwSaving ? "변경 중..." : "변경"}
              </button>
              {pwMsg && <span className={`text-xs ${pwMsg.ok ? "text-zinc-400" : "text-red-500"}`}>{pwMsg.text}</span>}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
