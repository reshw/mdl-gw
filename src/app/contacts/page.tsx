"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  getPersonalContacts, addPersonalContact, updatePersonalContact, deletePersonalContact,
  getGlobalContacts, addGlobalContact, updateGlobalContact, deleteGlobalContact,
  getMdlMembers, type Contact,
} from "@/lib/contacts";

const ADMIN_EMAIL = "reshw@naver.com";

interface EditState {
  id?: string;
  name: string;
  email: string;
  company: string;
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
  const [tab, setTab] = useState<"personal" | "global" | "members">("personal");
  const [members, setMembers] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getPersonalContacts().then(setPersonal);
    getGlobalContacts().then(setGlobal);
    getMdlMembers().then(setMembers);
  }, [user]);

  if (loading || !user) return null;

  const isAdmin = user.email === ADMIN_EMAIL;

  function openNew() {
    setEdit({ name: "", email: "", company: "", type: tab === "members" ? "personal" : tab });
    setError("");
  }

  function openEditContact(c: Contact) {
    setEdit({ id: c.id, name: c.name, email: c.email, company: c.company ?? "", type: tab === "members" ? "personal" : tab });
    setError("");
  }

  async function handleSave() {
    if (!edit) return;
    if (!edit.name.trim() || !edit.email.trim()) { setError("이름과 이메일을 입력해주세요."); return; }
    if (!edit.email.includes("@")) { setError("올바른 이메일 주소를 입력해주세요."); return; }
    setSaving(true);
    setError("");
    try {
      const company = edit.company.trim() || undefined;
      if (edit.type === "personal") {
        if (edit.id) {
          await updatePersonalContact(edit.id, edit.name, edit.email, company);
          setPersonal((prev) => prev.map((c) => c.id === edit.id ? { ...c, name: edit.name, email: edit.email, company } : c));
        } else {
          const id = await addPersonalContact(edit.name, edit.email, company);
          setPersonal((prev) => [...prev, { id, name: edit.name, email: edit.email, company }]);
        }
      } else {
        if (edit.id) {
          await updateGlobalContact(edit.id, edit.name, edit.email, company);
          setGlobal((prev) => prev.map((c) => c.id === edit.id ? { ...c, name: edit.name, email: edit.email, company } : c));
        } else {
          const id = await addGlobalContact(edit.name, edit.email, company);
          setGlobal((prev) => [...prev, { id, name: edit.name, email: edit.email, company }]);
        }
      }
      setEdit(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Contact) {
    if (!confirm(`${c.name}(${c.email})을 삭제할까요?`)) return;
    if (tab === "personal") {
      await deletePersonalContact(c.id);
      setPersonal((prev) => prev.filter((x) => x.id !== c.id));
    } else {
      await deleteGlobalContact(c.id);
      setGlobal((prev) => prev.filter((x) => x.id !== c.id));
    }
  }

  const contacts = tab === "personal" ? personal : tab === "global" ? global : members;
  const editable = tab === "personal" || (tab === "global" && isAdmin);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? contacts.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.company?.toLowerCase().includes(q) ?? false)
      )
    : contacts;

  return (
    <div className="h-screen flex bg-zinc-50 overflow-hidden">
      {/* 사이드바 */}
      <aside className="w-52 bg-white border-r border-zinc-200 flex flex-col p-4 gap-1 shrink-0">
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
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* 상단 바 */}
        <div className="bg-white border-b border-zinc-200 px-6 py-3 flex items-center gap-4 shrink-0">
          <div className="flex gap-1">
            {(["personal", "global", "members"] as const).map((t) => {
              const labels = { personal: "개인 주소록", global: "전체 주소록", members: "mdl 멤버" };
              const counts = { personal: personal.length, global: global.length, members: members.length };
              return (
                <button
                  key={t}
                  onClick={() => { setTab(t); setSearch(""); }}
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${tab === t ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"}`}
                >
                  {labels[t]}
                  {counts[t] > 0 && <span className={`ml-1 text-xs ${tab === t ? "opacity-70" : "text-zinc-400"}`}>{counts[t]}</span>}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름, 이메일, 회사 검색"
            className="flex-1 max-w-xs text-sm px-3 py-1.5 border border-zinc-200 rounded-lg bg-zinc-50 text-black placeholder-zinc-400 outline-none focus:border-zinc-400"
          />
          <div className="flex-1" />
          {editable && (
            <button
              onClick={openNew}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 shrink-0"
            >
              + 추가
            </button>
          )}
        </div>

        {/* 테이블 */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-400 px-6 py-8">{q ? "검색 결과가 없습니다." : "연락처가 없습니다."}</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-zinc-50 z-10">
                <tr className="border-b border-zinc-200">
                  <th className="text-left text-xs font-medium text-zinc-400 px-6 py-2 w-40">이름</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-2 w-48">회사</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-2">이메일</th>
                  {editable && <th className="w-24" />}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-zinc-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50 group">
                    <td className="px-6 py-2.5 font-medium text-zinc-900 whitespace-nowrap">{c.name}</td>
                    <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">{c.company ?? ""}</td>
                    <td className="px-4 py-2.5 text-zinc-500">{c.email}</td>
                    {editable && (
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => openEditContact(c)}
                          className="text-xs text-zinc-400 hover:text-zinc-700 px-2 py-0.5 rounded hover:bg-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                        >
                          삭제
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
                autoFocus
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg text-black outline-none focus:border-zinc-400"
              />
              <input
                type="email"
                placeholder="이메일"
                value={edit.email}
                onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg text-black outline-none focus:border-zinc-400"
              />
              <input
                type="text"
                placeholder="회사 (선택)"
                value={edit.company}
                onChange={(e) => setEdit({ ...edit, company: e.target.value })}
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
