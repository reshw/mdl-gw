"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  getPersonalContacts, addPersonalContact, updatePersonalContact, deletePersonalContact,
  getGlobalContacts, addGlobalContact, updateGlobalContact, deleteGlobalContact,
  type Contact,
} from "@/lib/contacts";

const ADMIN_EMAIL = "reshw@naver.com";

interface EditState {
  id?: string;
  name: string;
  email: string;
  type: "personal" | "global";
}

export default function ContactsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [personal, setPersonal] = useState<Contact[]>([]);
  const [global, setGlobal] = useState<Contact[]>([]);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getPersonalContacts().then(setPersonal);
    getGlobalContacts().then(setGlobal);
  }, [user]);

  if (loading || !user) return null;

  const isAdmin = user.email === ADMIN_EMAIL;

  function openNew(type: "personal" | "global") {
    setEdit({ name: "", email: "", type });
    setError("");
  }

  function openEditContact(c: Contact, type: "personal" | "global") {
    setEdit({ id: c.id, name: c.name, email: c.email, type });
    setError("");
  }

  async function handleSave() {
    if (!edit) return;
    if (!edit.name.trim() || !edit.email.trim()) { setError("이름과 이메일을 입력해주세요."); return; }
    if (!edit.email.includes("@")) { setError("올바른 이메일 주소를 입력해주세요."); return; }
    setSaving(true);
    setError("");
    try {
      if (edit.type === "personal") {
        if (edit.id) {
          await updatePersonalContact(edit.id, edit.name, edit.email);
          setPersonal((prev) => prev.map((c) => c.id === edit.id ? { ...c, name: edit.name, email: edit.email } : c));
        } else {
          const id = await addPersonalContact(edit.name, edit.email);
          setPersonal((prev) => [...prev, { id, name: edit.name, email: edit.email }]);
        }
      } else {
        if (edit.id) {
          await updateGlobalContact(edit.id, edit.name, edit.email);
          setGlobal((prev) => prev.map((c) => c.id === edit.id ? { ...c, name: edit.name, email: edit.email } : c));
        } else {
          const id = await addGlobalContact(edit.name, edit.email);
          setGlobal((prev) => [...prev, { id, name: edit.name, email: edit.email }]);
        }
      }
      setEdit(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Contact, type: "personal" | "global") {
    if (!confirm(`${c.name}(${c.email})을 삭제할까요?`)) return;
    if (type === "personal") {
      await deletePersonalContact(c.id);
      setPersonal((prev) => prev.filter((x) => x.id !== c.id));
    } else {
      await deleteGlobalContact(c.id);
      setGlobal((prev) => prev.filter((x) => x.id !== c.id));
    }
  }

  function ContactList({ contacts, type, editable }: { contacts: Contact[]; type: "personal" | "global"; editable: boolean }) {
    return (
      <div className="flex flex-col gap-2">
        {contacts.length === 0 && (
          <p className="text-sm text-zinc-400 py-2">연락처가 없습니다.</p>
        )}
        {contacts.map((c) => (
          <div key={c.id} className="flex items-center justify-between bg-white rounded-xl border border-zinc-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">{c.name}</p>
              <p className="text-xs text-zinc-500">{c.email}</p>
            </div>
            {editable && (
              <div className="flex gap-2">
                <button
                  onClick={() => openEditContact(c, type)}
                  className="text-xs text-zinc-500 hover:text-zinc-900 px-2 py-1 rounded hover:bg-zinc-50"
                >
                  수정
                </button>
                <button
                  onClick={() => handleDelete(c, type)}
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-zinc-50 overflow-hidden">
      {/* 사이드바 */}
      <aside className="w-52 bg-white border-r border-zinc-200 flex flex-col p-4 gap-1">
        <div className="text-sm font-semibold text-zinc-900 mb-4">mdl.kr 메일</div>
        <button
          onClick={() => router.push("/mail")}
          className="text-left text-sm px-3 py-2 rounded-lg text-zinc-600 hover:bg-zinc-50"
        >
          ← 메일함으로
        </button>
        <div className="flex-1" />
        <div className="text-xs text-zinc-500 truncate">{user.email}</div>
      </aside>

      {/* 본문 */}
      <main className="flex-1 overflow-y-auto p-8">
        <h1 className="text-lg font-semibold text-zinc-900 mb-6">주소록</h1>

        {/* 개인 주소록 */}
        <section className="mb-8 max-w-2xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-900">개인 주소록</h2>
            <button
              onClick={() => openNew("personal")}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
            >
              + 추가
            </button>
          </div>
          <ContactList contacts={personal} type="personal" editable={true} />
        </section>

        {/* 전체 주소록 */}
        <section className="max-w-2xl">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">전체 주소록</h2>
              <p className="text-xs text-zinc-400">모든 사용자에게 공유되는 연락처</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => openNew("global")}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
              >
                + 추가
              </button>
            )}
          </div>
          <ContactList contacts={global} type="global" editable={isAdmin} />
        </section>
      </main>

      {/* 추가/수정 모달 */}
      {edit && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">
              {edit.id ? "연락처 수정" : "연락처 추가"}
              <span className="ml-2 text-xs font-normal text-zinc-400">
                {edit.type === "personal" ? "개인" : "전체"}
              </span>
            </h3>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="이름"
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg text-black outline-none focus:border-zinc-400"
              />
              <input
                type="email"
                placeholder="이메일"
                value={edit.email}
                onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg text-black outline-none focus:border-zinc-400"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button
                onClick={() => setEdit(null)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
