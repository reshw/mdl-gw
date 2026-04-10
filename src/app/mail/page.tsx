"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  subscribeMails, markAsRead, markAsUnread, subscribeDrafts, deleteDraft,
  subscribeTrash, moveToTrash, restoreFromTrash, permanentDelete,
  subscribeInboxUnread, getTrackingStatus,
  type Mail, type Draft, type TrackingStatus,
} from "@/lib/mail";
import {
  subscribeLabels, createLabel, deleteLabel, addLabelToMail, removeLabelFromMail,
  LABEL_COLORS, type Label,
} from "@/lib/labels";
import ComposeModal from "@/components/ComposeModal";
import { addPersonalContact } from "@/lib/contacts";

type Folder = "inbox" | "sent" | "draft" | "trash";

export default function MailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mails, setMails] = useState<Mail[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [trashMails, setTrashMails] = useState<Mail[]>([]);
  const [selected, setSelected] = useState<Mail | null>(null);
  const [composing, setComposing] = useState(false);
  const [editingDraft, setEditingDraft] = useState<Draft | undefined>(undefined);
  const [composeInit, setComposeInit] = useState<{ to?: string[]; cc?: string[]; subject?: string; html?: string } | undefined>(undefined);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState<Folder>("inbox");
  const [quickAdd, setQuickAdd] = useState<{ email: string; name: string } | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [inboxUnread, setInboxUnread] = useState(0);
  const [trackingStatus, setTrackingStatus] = useState<Record<string, TrackingStatus> | null>(null);

  // 라벨 상태
  const [labels, setLabels] = useState<Label[]>([]);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [showLabelCreate, setShowLabelCreate] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("blue");
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);
  const labelDropdownRef = useRef<HTMLDivElement>(null);

  // 모바일 상태
  const [mobilePane, setMobilePane] = useState<"list" | "viewer">("list");
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user?.email) return;
    setSelected(null);
    setSearchQuery("");
    setCheckedIds(new Set());
    setShowLabelDropdown(false);
    if (folder === "draft" || folder === "trash") return;
    const unsub = subscribeMails(user.email, setMails, folder);
    return () => unsub();
  }, [user, folder]);

  useEffect(() => {
    if (!user?.email) return;
    const unsub = subscribeDrafts(user.email, setDrafts);
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user?.email) return;
    const unsub = subscribeTrash(user.email, setTrashMails);
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user?.email) return;
    const unsub = subscribeInboxUnread(user.email, setInboxUnread);
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user?.email) return;
    const unsub = subscribeLabels(user.email, setLabels);
    return () => unsub();
  }, [user]);

  useEffect(() => {
    setTrackingStatus(null);
    setShowLabelDropdown(false);
    if (folder === "sent" && selected?.trackIds && Object.keys(selected.trackIds).length > 0) {
      getTrackingStatus(selected.trackIds).then(setTrackingStatus);
    }
  }, [selected, folder]);

  // 라벨 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!showLabelDropdown) return;
    function onClickOutside(e: MouseEvent) {
      if (labelDropdownRef.current && !labelDropdownRef.current.contains(e.target as Node)) {
        setShowLabelDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showLabelDropdown]);

  if (loading) return null;
  if (!user) return null;

  async function handleSelect(mail: Mail) {
    setSelected(mail);
    setMobilePane("viewer");
    setShowLabelDropdown(false);
    if (!mail.read) await markAsRead(mail);
  }

  async function handleMarkUnread(mail: Mail) {
    await markAsUnread(mail.id);
    setSelected(null);
  }

  async function handleBulkMarkUnread() {
    await Promise.all([...checkedIds].map((id) => markAsUnread(id)));
    if (selected && checkedIds.has(selected.id)) setSelected(null);
    setCheckedIds(new Set());
  }

  function parseEmailAddress(raw: string): { name: string; email: string } {
    const match = raw.match(/^"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    if (match) return { name: match[1].trim(), email: match[2].trim() };
    return { name: "", email: raw.trim() };
  }

  function openDraft(draft: Draft) {
    setEditingDraft(draft);
    setComposing(true);
  }



  function handleComposeClose() {
    setComposing(false);
    setEditingDraft(undefined);
    setComposeInit(undefined);
  }

  function handleReply(mail: Mail) {
    const prefix = mail.subject.startsWith("Re:") ? "" : "Re: ";
    setComposeInit({ to: [mail.from], subject: `${prefix}${mail.subject}`, html: quoteHtml(mail) });
    setEditingDraft(undefined);
    setComposing(true);
  }

  function handleReplyAll(mail: Mail) {
    const prefix = mail.subject.startsWith("Re:") ? "" : "Re: ";
    const ccAddrs = mail.cc ? mail.cc.split(",").map((s) => s.trim()).filter(Boolean) : [];
    setComposeInit({ to: [mail.from], cc: ccAddrs, subject: `${prefix}${mail.subject}`, html: quoteHtml(mail) });
    setEditingDraft(undefined);
    setComposing(true);
  }

  function handleForward(mail: Mail) {
    setComposeInit({ to: [], subject: `Fwd: ${mail.subject}`, html: quoteHtml(mail) });
    setEditingDraft(undefined);
    setComposing(true);
  }

  function quoteHtml(mail: Mail): string {
    const date = new Date(mail.createdAt).toLocaleString("ko-KR");
    const body = mail.html || `<pre>${mail.text ?? ""}</pre>`;
    return `<br><br><div style="border-left:3px solid #d1d5db;padding-left:12px;color:#6b7280;font-size:13px;"><p style="margin:0 0 4px 0"><b>보낸 사람:</b> ${mail.from}</p><p style="margin:0 0 4px 0"><b>날짜:</b> ${date}</p><p style="margin:0 0 8px 0"><b>제목:</b> ${mail.subject}</p>${body}</div>`;
  }

  async function handleTrash(mail: Mail, e: React.MouseEvent) {
    e.stopPropagation();
    if (selected?.id === mail.id) setSelected(null);
    await moveToTrash(mail.id);
  }

  async function handleRestore(mail: Mail) {
    setSelected(null);
    await restoreFromTrash(mail.id);
  }

  async function handlePermanentDelete(mail: Mail) {
    setSelected(null);
    await permanentDelete(mail.id);
  }

  function toggleCheck(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (folder === "draft") setCheckedIds(new Set(filteredDrafts.map((d) => d.id)));
    else setCheckedIds(new Set(displayedMails.map((m) => m.id)));
  }

  async function handleBulkTrash() {
    await Promise.all([...checkedIds].map((id) => moveToTrash(id)));
    if (selected && checkedIds.has(selected.id)) setSelected(null);
    setCheckedIds(new Set());
  }

  async function handleBulkRestore() {
    await Promise.all([...checkedIds].map((id) => restoreFromTrash(id)));
    if (selected && checkedIds.has(selected.id)) setSelected(null);
    setCheckedIds(new Set());
  }

  async function handleBulkPermanentDelete() {
    if (!confirm(`${checkedIds.size}개를 영구 삭제할까요?`)) return;
    await Promise.all([...checkedIds].map((id) => permanentDelete(id)));
    if (selected && checkedIds.has(selected.id)) setSelected(null);
    setCheckedIds(new Set());
  }

  async function handleBulkDeleteDraft() {
    await Promise.all([...checkedIds].map((id) => deleteDraft(id)));
    setCheckedIds(new Set());
  }

  function handleBulkCompose() {
    const recipients = [...checkedIds]
      .map((id) => displayedMails.find((m) => m.id === id))
      .filter(Boolean)
      .map((m) => folder === "sent" ? m!.to.split(",").map((s) => s.trim()) : [m!.from])
      .flat()
      .filter((v, i, arr) => arr.indexOf(v) === i);
    setComposeInit({ to: recipients });
    setEditingDraft(undefined);
    setComposing(true);
    setCheckedIds(new Set());
  }

  async function handleDeleteDraft(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await deleteDraft(id);
  }

  // 라벨 핸들러
  async function handleCreateLabel() {
    if (!newLabelName.trim() || !user?.email) return;
    await createLabel(user.email, newLabelName.trim(), newLabelColor);
    setNewLabelName("");
    setNewLabelColor("blue");
    setShowLabelCreate(false);
  }

  async function handleDeleteLabel(labelId: string) {
    await deleteLabel(labelId);
    if (activeLabel === labelId) setActiveLabel(null);
  }

  async function handleToggleLabel(mailId: string, labelId: string, hasLabel: boolean) {
    if (hasLabel) {
      await removeLabelFromMail(mailId, labelId);
    } else {
      await addLabelToMail(mailId, labelId);
    }
  }

  function handleActivateLabel(labelId: string) {
    if (activeLabel === labelId) {
      setActiveLabel(null);
    } else {
      setActiveLabel(labelId);
      setFolder("inbox");
      setSelected(null);
      setCheckedIds(new Set());
    }
    setMobilePane("list");
    setTimeout(() => setShowMobileSidebar(false), 150);
  }

  const folderLabel: Record<Folder, string> = {
    inbox: "받은편지함",
    sent: "보낸편지함",
    draft: "임시보관함",
    trash: "휴지통",
  };

  const currentMails = folder === "trash" ? trashMails : mails;

  const q = searchQuery.trim().toLowerCase();
  const filteredMails = q
    ? currentMails.filter((m) =>
        m.subject.toLowerCase().includes(q) ||
        m.from.toLowerCase().includes(q) ||
        m.to.toLowerCase().includes(q) ||
        (m.text ?? "").toLowerCase().includes(q)
      )
    : currentMails;

  // 라벨 필터 적용
  const displayedMails = activeLabel
    ? filteredMails.filter((m) => m.labels?.includes(activeLabel))
    : filteredMails;

  const filteredDrafts = q
    ? drafts.filter((d) =>
        (d.subject ?? "").toLowerCase().includes(q) ||
        (d.to ?? "").toLowerCase().includes(q)
      )
    : drafts;

  // 현재 헤더 타이틀
  const activeLabelObj = activeLabel ? labels.find((l) => l.id === activeLabel) : null;
  const listTitle = activeLabelObj ? activeLabelObj.name : folderLabel[folder];

  return (
    <div className="h-screen flex bg-zinc-50 overflow-hidden">
      {/* 모바일 사이드바 오버레이 */}
      {showMobileSidebar && (
        <div className="fixed inset-0 bg-black/20 z-30 lg:hidden" onClick={() => setShowMobileSidebar(false)} />
      )}

      {/* 사이드바 */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-zinc-200 flex flex-col p-4 gap-1 overflow-y-auto transition-transform duration-200 lg:static lg:translate-x-0 lg:w-52 ${showMobileSidebar ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="text-sm font-semibold text-zinc-900 mb-4">mdl.kr 메일</div>

        {/* 폴더 목록 */}
        {(["inbox", "sent", "draft", "trash"] as Folder[]).map((f) => (
          <button
            key={f}
            onClick={() => { setFolder(f); setActiveLabel(null); setMobilePane("list"); setTimeout(() => setShowMobileSidebar(false), 150); }}
            className={`text-left text-sm px-3 py-2 rounded-lg active:bg-zinc-100 ${folder === f && !activeLabel ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600 hover:bg-zinc-50"}`}
          >
            {folderLabel[f]}
            {f === "inbox" && inboxUnread > 0 && (
              <span className="ml-2 text-xs bg-zinc-900 text-white rounded-full px-1.5 py-0.5">
                {inboxUnread}
              </span>
            )}
            {f === "draft" && drafts.length > 0 && (
              <span className="ml-2 text-xs bg-zinc-400 text-white rounded-full px-1.5 py-0.5">
                {drafts.length}
              </span>
            )}
            {f === "trash" && trashMails.length > 0 && (
              <span className="ml-2 text-xs bg-zinc-400 text-white rounded-full px-1.5 py-0.5">
                {trashMails.length}
              </span>
            )}
          </button>
        ))}

        {/* 라벨 섹션 */}
        <div className="mt-3 pt-3 border-t border-zinc-100">
          <div className="flex items-center justify-between mb-1 px-1">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">라벨</span>
            <button
              onClick={() => setShowLabelCreate((v) => !v)}
              className="text-zinc-400 hover:text-zinc-700 text-base leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-100"
            >
              +
            </button>
          </div>

          {showLabelCreate && (
            <div className="flex flex-col gap-2 mb-2 p-2 bg-zinc-50 rounded-lg border border-zinc-100">
              <input
                type="text"
                placeholder="라벨 이름"
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateLabel();
                  if (e.key === "Escape") setShowLabelCreate(false);
                }}
                autoFocus
                className="w-full px-2 py-1 text-xs border border-zinc-200 rounded text-black outline-none focus:border-zinc-400 bg-white"
              />
              <div className="flex gap-1.5 flex-wrap">
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setNewLabelColor(c.value)}
                    className={`w-4 h-4 rounded-full ${c.dot} transition-transform ${newLabelColor === c.value ? "ring-2 ring-offset-1 ring-zinc-500 scale-110" : ""}`}
                  />
                ))}
              </div>
              <button
                onClick={handleCreateLabel}
                disabled={!newLabelName.trim()}
                className="text-xs px-2 py-1 rounded bg-zinc-900 text-white disabled:opacity-40 hover:bg-zinc-700"
              >
                만들기
              </button>
            </div>
          )}

          {labels.map((label) => {
            const colorConf = LABEL_COLORS.find((c) => c.value === label.color) ?? LABEL_COLORS[4];
            const isActive = activeLabel === label.id;
            return (
              <button
                key={label.id}
                onClick={() => handleActivateLabel(label.id)}
                className={`group w-full text-left text-sm px-3 py-1.5 rounded-lg flex items-center gap-2 active:bg-zinc-100 ${isActive ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600 hover:bg-zinc-50"}`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${colorConf.dot}`} />
                <span className="flex-1 truncate text-xs">{label.name}</span>
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); handleDeleteLabel(label.id); }}
                  className="hidden group-hover:inline text-zinc-300 hover:text-red-400 text-xs leading-none"
                >
                  ✕
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex-1" />
        {user.email === "reshw@naver.com" && (
          <button
            onClick={() => router.push("/admin")}
            className="text-left text-sm px-3 py-2 rounded-lg text-zinc-500 hover:bg-zinc-50"
          >
            가입 승인
          </button>
        )}
        <button
          onClick={() => router.push("/contacts")}
          className="text-left text-sm px-3 py-2 rounded-lg text-zinc-500 hover:bg-zinc-50"
        >
          주소록
        </button>
        <button
          onClick={() => router.push("/settings")}
          className="text-left text-sm px-3 py-2 rounded-lg text-zinc-500 hover:bg-zinc-50"
        >
          설정
        </button>
        <div className="text-xs text-zinc-500 truncate">{user.email}</div>
        <button
          onClick={() => signOut(auth).then(() => router.push("/"))}
          className="text-left text-sm px-3 py-2 rounded-lg text-zinc-500 hover:bg-zinc-50"
        >
          로그아웃
        </button>
      </aside>

      {/* 메일 목록 */}
      <div className={`border-r border-zinc-200 bg-white flex-col w-full lg:w-80 ${mobilePane === "viewer" ? "hidden lg:flex" : "flex"}`}>
        <div className="border-b border-zinc-200 px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setShowMobileSidebar(true)}
              className="lg:hidden text-zinc-500 hover:text-zinc-900 text-lg leading-none shrink-0"
              aria-label="메뉴"
            >
              ☰
            </button>
            <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-2 truncate">
              {activeLabelObj && (
                <span className={`w-2 h-2 rounded-full shrink-0 ${LABEL_COLORS.find((c) => c.value === activeLabelObj.color)?.dot ?? "bg-zinc-400"}`} />
              )}
              {listTitle}
            </h2>
          </div>
          <button
            onClick={() => { setEditingDraft(undefined); setComposeInit(undefined); setComposing(true); }}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 shrink-0"
          >
            메일 쓰기
          </button>
        </div>

        {checkedIds.size > 0 ? (
          <div className="px-3 py-2 border-b border-zinc-100 bg-zinc-50 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-500 shrink-0">{checkedIds.size}개 선택</span>
            <button onClick={selectAll} className="text-xs text-zinc-500 hover:text-zinc-900">전체선택</button>
            <div className="flex-1" />
            {folder === "trash" ? (
              <>
                <button onClick={handleBulkRestore} className="text-xs px-2 py-1 rounded border border-zinc-200 text-zinc-600 hover:bg-white">복원</button>
                <button onClick={handleBulkPermanentDelete} className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50">영구삭제</button>
              </>
            ) : folder === "draft" ? (
              <button onClick={handleBulkDeleteDraft} className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50">삭제</button>
            ) : (
              <>
                {folder === "inbox" && (
                  <button onClick={handleBulkMarkUnread} className="text-xs px-2 py-1 rounded border border-zinc-200 text-zinc-600 hover:bg-white">안읽음</button>
                )}
                <button onClick={handleBulkTrash} className="text-xs px-2 py-1 rounded border border-zinc-200 text-zinc-600 hover:bg-white">삭제</button>
                <button onClick={handleBulkCompose} className="text-xs px-2 py-1 rounded border border-zinc-200 text-zinc-600 hover:bg-white">단체발송</button>
              </>
            )}
            <button onClick={() => setCheckedIds(new Set())} className="text-xs text-zinc-400 hover:text-zinc-600">취소</button>
          </div>
        ) : (
          <div className="px-3 py-2 border-b border-zinc-100">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="검색 (보낸사람, 제목, 내용)"
              className="w-full text-xs px-3 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-black placeholder-zinc-400 outline-none focus:border-zinc-400"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {folder === "draft" ? (
            filteredDrafts.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-zinc-400">{q ? "검색 결과가 없습니다." : "임시저장된 메일이 없습니다."}</div>
            ) : (
              filteredDrafts.map((draft) => (
                <div key={draft.id} className={`flex items-stretch border-b border-zinc-100 hover:bg-zinc-50 group ${checkedIds.has(draft.id) ? "bg-zinc-50" : ""}`}>
                  <label className={`flex items-center pl-3 pr-1 cursor-pointer ${checkedIds.size > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={checkedIds.has(draft.id)} onChange={() => toggleCheck(draft.id)} className="accent-zinc-800" />
                  </label>
                  <button onClick={() => openDraft(draft)} className="flex-1 text-left px-3 py-3 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-500 truncate">{draft.to || "(받는 사람 없음)"}</span>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <span className="text-xs text-zinc-400">
                          {new Date(draft.updatedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                        </span>
                        <span onClick={(e) => handleDeleteDraft(draft.id, e)} className="hidden group-hover:inline text-zinc-300 hover:text-zinc-500 text-xs px-1">✕</span>
                      </div>
                    </div>
                    <div className="text-sm truncate text-zinc-600">{draft.subject || "(제목 없음)"}</div>
                  </button>
                </div>
              ))
            )
          ) : displayedMails.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-zinc-400">
              {q ? "검색 결과가 없습니다." : activeLabel ? "이 라벨의 메일이 없습니다." : { inbox: "받은 메일이 없습니다.", sent: "보낸 메일이 없습니다.", trash: "휴지통이 비어있습니다.", draft: "" }[folder]}
            </div>
          ) : (
            displayedMails.map((mail) => {
              const mailLabelDots = (mail.labels ?? [])
                .map((lid) => labels.find((l) => l.id === lid))
                .filter(Boolean) as Label[];
              return (
                <div key={mail.id} className={`flex items-stretch border-b border-zinc-100 hover:bg-zinc-50 group ${selected?.id === mail.id || checkedIds.has(mail.id) ? "bg-zinc-50" : ""}`}>
                  <label className={`flex items-center pl-3 pr-1 cursor-pointer ${checkedIds.size > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={checkedIds.has(mail.id)} onChange={() => toggleCheck(mail.id)} className="accent-zinc-800" />
                  </label>
                  <button onClick={() => handleSelect(mail)} className="flex-1 text-left px-3 py-3 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs truncate ${!mail.read ? "font-semibold text-zinc-900" : "text-zinc-500"}`}>
                        {folder === "sent" ? mail.to : mail.from}
                      </span>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <span className="text-xs text-zinc-400">
                          {new Date(mail.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                        </span>
                        {folder !== "trash" && (
                          <span
                            onClick={(e) => handleTrash(mail, e)}
                            className="hidden group-hover:inline text-zinc-300 hover:text-red-400 text-xs px-1"
                            title="휴지통으로 이동"
                          >
                            🗑
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`text-sm truncate ${!mail.read ? "font-medium text-zinc-900" : "text-zinc-600"}`}>
                      {mail.failed && <span className="mr-1">⚠️</span>}
                      {mail.subject}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs text-zinc-400 truncate flex-1">{mail.text?.slice(0, 60)}</span>
                      {mailLabelDots.length > 0 && (
                        <div className="flex gap-0.5 shrink-0">
                          {mailLabelDots.map((lbl) => {
                            const colorConf = LABEL_COLORS.find((c) => c.value === lbl.color) ?? LABEL_COLORS[4];
                            return <span key={lbl.id} className={`w-1.5 h-1.5 rounded-full ${colorConf.dot}`} title={lbl.name} />;
                          })}
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 메일 뷰어 */}
      <main className={`flex-col min-h-0 flex-1 ${mobilePane === "list" ? "hidden lg:flex" : "flex"}`}>
        {/* 모바일 뒤로가기 버튼 */}
        <div className="lg:hidden border-b border-zinc-200 px-4 py-2 shrink-0">
          <button
            onClick={() => setMobilePane("list")}
            className="flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← 목록
          </button>
        </div>
        {selected && folder !== "draft" ? (
          <div className="flex-1 overflow-y-auto p-4 lg:p-8 min-h-0">
            <div className="flex items-start justify-between mb-4">
              <h1 className="text-xl font-semibold text-zinc-900">{selected.subject}</h1>
              <div className="flex gap-2 shrink-0 ml-4 flex-wrap justify-end">
                {folder === "trash" ? (
                  <>
                    <button onClick={() => handleRestore(selected)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">복원</button>
                    <button onClick={() => handlePermanentDelete(selected)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50">영구 삭제</button>
                  </>
                ) : (
                  <>
                    {folder === "inbox" && (
                      <button onClick={() => handleMarkUnread(selected)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">안읽음</button>
                    )}
                    <button onClick={() => handleReply(selected)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">답장</button>
                    {selected.cc && (
                      <button onClick={() => handleReplyAll(selected)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">전체답장</button>
                    )}
                    <button onClick={() => handleForward(selected)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">전달</button>

                    {/* 라벨 드롭다운 */}
                    <div className="relative" ref={labelDropdownRef}>
                      <button
                        onClick={() => setShowLabelDropdown((v) => !v)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 ${showLabelDropdown ? "border-zinc-400 text-zinc-900 bg-zinc-50" : "border-zinc-200 text-zinc-600"}`}
                      >
                        라벨
                        {(selected.labels?.length ?? 0) > 0 && (
                          <span className="ml-1 text-zinc-400">({selected.labels!.length})</span>
                        )}
                      </button>
                      {showLabelDropdown && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-zinc-200 rounded-xl shadow-lg z-20 py-1.5 overflow-hidden">
                          {labels.length === 0 ? (
                            <p className="text-xs text-zinc-400 px-3 py-2">라벨 없음 — 사이드바에서 만드세요</p>
                          ) : (
                            labels.map((label) => {
                              const colorConf = LABEL_COLORS.find((c) => c.value === label.color) ?? LABEL_COLORS[4];
                              const hasLabel = selected.labels?.includes(label.id) ?? false;
                              return (
                                <button
                                  key={label.id}
                                  onClick={() => handleToggleLabel(selected.id, label.id, hasLabel)}
                                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                                >
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${colorConf.dot}`} />
                                  <span className="flex-1 text-left">{label.name}</span>
                                  {hasLabel && <span className="text-zinc-900 font-bold">✓</span>}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={(e) => handleTrash(selected, e)}
                      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200"
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 라벨 칩 표시 */}
            {(selected.labels?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {selected.labels!.map((lid) => {
                  const lbl = labels.find((l) => l.id === lid);
                  if (!lbl) return null;
                  const colorConf = LABEL_COLORS.find((c) => c.value === lbl.color) ?? LABEL_COLORS[4];
                  return (
                    <span
                      key={lid}
                      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${colorConf.pill}`}
                    >
                      {lbl.name}
                      <button
                        onClick={() => handleToggleLabel(selected.id, lid, true)}
                        className="opacity-60 hover:opacity-100 leading-none"
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col gap-1 text-sm text-zinc-500 mb-6">
              <div className="flex gap-2 items-center">
                <span className="shrink-0">보낸 사람:</span>
                <span className="text-zinc-900">{selected.from}</span>
                <button
                  onClick={() => setQuickAdd(parseEmailAddress(selected.from))}
                  title="연락처 추가"
                  className="text-zinc-300 hover:text-zinc-600 text-xs leading-none"
                >
                  +
                </button>
              </div>
              <div className="flex gap-2">
                <span className="shrink-0">받는 사람:</span>
                <div className="flex flex-wrap gap-1">
                  {selected.to.split(",").map((addr, i) => {
                    const email = addr.trim();
                    const ts = trackingStatus?.[email];
                    return (
                      <span key={i} className="flex items-center gap-1 bg-zinc-100 text-zinc-800 text-xs rounded-full px-2.5 py-0.5">
                        {email}
                        {folder === "sent" && selected.trackIds && (
                          ts === undefined && trackingStatus !== null ? null :
                          ts?.openedAt ? (
                            <span className="text-green-600 font-medium" title={`읽음: ${new Date(ts.openedAt).toLocaleString("ko-KR")}`}>
                              ✓ {new Date(ts.openedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          ) : trackingStatus !== null ? (
                            <span className="text-zinc-400">○ 미확인</span>
                          ) : null
                        )}
                        <button
                          onClick={() => setQuickAdd(parseEmailAddress(email))}
                          title="연락처 추가"
                          className="text-zinc-300 hover:text-zinc-500 leading-none"
                        >
                          +
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
              {selected.cc && (
                <div className="flex gap-2">
                  <span className="shrink-0">참조:</span>
                  <div className="flex flex-wrap gap-1">
                    {selected.cc.split(",").map((addr, i) => (
                      <span key={i} className="flex items-center gap-1 bg-zinc-100 text-zinc-800 text-xs rounded-full px-2.5 py-0.5">
                        {addr.trim()}
                        <button
                          onClick={() => setQuickAdd(parseEmailAddress(addr.trim()))}
                          title="연락처 추가"
                          className="text-zinc-300 hover:text-zinc-500 leading-none"
                        >
                          +
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <span className="shrink-0">날짜:</span>
                <span className="text-zinc-900">{new Date(selected.createdAt).toLocaleString("ko-KR")}</span>
              </div>
            </div>

            {selected.failed && (
              <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-red-700">
                    ⚠️ {folder === "sent" ? "발송 실패" : "수신 처리 실패"}
                  </p>
                  {selected.failReason && (
                    <p className="text-xs text-red-500 mt-0.5">{selected.failReason}</p>
                  )}
                  {folder !== "sent" && (
                    <p className="text-xs text-zinc-500 mt-1">발신자({selected.from})에게 메일을 다시 보내달라고 요청해 주세요.</p>
                  )}
                </div>
                {folder === "sent" && (
                  <button
                    onClick={() => {
                      setComposeInit({
                        to: selected.to.split(",").map((s) => s.trim()).filter(Boolean),
                        subject: selected.subject,
                        html: selected.html,
                      });
                      setEditingDraft(undefined);
                      setComposing(true);
                    }}
                    className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                  >
                    다시 보내기
                  </button>
                )}
              </div>
            )}

            <div className="border-t border-zinc-200 pt-6">
              {selected.html ? (
                <iframe
                  srcDoc={/<head/i.test(selected.html) ? selected.html.replace(/(<head[^>]*>)/i, '$1<base target="_blank">') : '<base target="_blank">' + selected.html}
                  className="w-full border-0"
                  style={{ height: "600px" }}
                  sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"
                  onLoad={(e) => {
                    const iframe = e.currentTarget;
                    try {
                      const height = iframe.contentDocument?.body?.scrollHeight;
                      if (height) iframe.style.height = height + 32 + "px";
                    } catch {}
                  }}
                />
              ) : (
                <pre className="text-sm text-zinc-700 whitespace-pre-wrap">{selected.text}</pre>
              )}
            </div>

            {selected.attachments?.length > 0 && (
              <div className="border-t border-zinc-200 pt-4 mt-6">
                <p className="text-xs font-medium text-zinc-500 mb-2">첨부파일 ({selected.attachments.length})</p>
                <div className="flex flex-wrap gap-2">
                  {selected.attachments.map((att, i) => (
                    <a
                      key={i}
                      href={`/api/attachment?key=${encodeURIComponent(att.r2Key)}`}
                      download={att.name}
                      className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50"
                    >
                      <span>{att.name}</span>
                      <span className="text-zinc-400">{(att.size / 1024).toFixed(0)}KB</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-zinc-400">
            {folder === "draft" ? "임시저장된 메일을 클릭해 이어 작성하세요." : "메일을 선택하세요."}
          </div>
        )}
      </main>

      {composing && <ComposeModal onClose={handleComposeClose} draft={editingDraft} init={composeInit} />}

      {quickAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">연락처 추가</h3>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="이름"
                value={quickAdd.name}
                onChange={(e) => setQuickAdd({ ...quickAdd, name: e.target.value })}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") document.getElementById("quick-add-save")?.click(); }}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg text-black outline-none focus:border-zinc-400"
              />
              <input
                type="email"
                placeholder="이메일 주소"
                value={quickAdd.email}
                onChange={(e) => setQuickAdd({ ...quickAdd, email: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") document.getElementById("quick-add-save")?.click(); }}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg text-black outline-none focus:border-zinc-400"
              />
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button
                onClick={() => setQuickAdd(null)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                취소
              </button>
              <button
                id="quick-add-save"
                disabled={quickSaving || !quickAdd.name.trim() || !quickAdd.email.trim()}
                onClick={async () => {
                  setQuickSaving(true);
                  try {
                    await addPersonalContact(quickAdd.name.trim(), quickAdd.email);
                    setQuickAdd(null);
                  } finally {
                    setQuickSaving(false);
                  }
                }}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {quickSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
