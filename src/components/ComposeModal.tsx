"use client";

import { useEffect, useRef, useState } from "react";
import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import RichEditor from "@/components/RichEditor";
import EmailChipInput from "@/components/EmailChipInput";
import { saveSentMail, saveDraft, deleteDraft, type Draft } from "@/lib/mail";
import { getSignature } from "@/lib/settings";
import { getPersonalContacts, getGlobalContacts, getMdlMembers, type Contact } from "@/lib/contacts";

interface ComposeInit {
  to?: string[];
  cc?: string[];
  subject?: string;
  html?: string;
  forwardAttachments?: { name: string; r2Key?: string; contentType?: string; size?: number }[];
}

interface Props {
  onClose: () => void;
  draft?: Draft;
  init?: ComposeInit;
  mailEmail?: string | null;
}

// 임시저장은 주소를 쉼표 문자열로 보관한다. 값이 없으면 undefined를 돌려줘 init 폴백이 살도록.
function splitAddrs(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

export default function ComposeModal({ onClose, draft, init, mailEmail }: Props) {
  const [to, setTo] = useState<string[]>(
    draft?.to ? draft.to.split(",").map((s) => s.trim()).filter(Boolean)
    : init?.to ?? []
  );
  const [cc, setCc] = useState<string[]>(splitAddrs(draft?.cc) ?? init?.cc ?? []);
  const [bcc, setBcc] = useState<string[]>(splitAddrs(draft?.bcc) ?? []);
  const [showCc, setShowCc] = useState((splitAddrs(draft?.cc) ?? init?.cc ?? []).length > 0);
  const [showBcc, setShowBcc] = useState((splitAddrs(draft?.bcc) ?? []).length > 0);
  const [subject, setSubject] = useState(draft?.subject ?? init?.subject ?? "");
  const [html, setHtml] = useState(draft?.html ?? init?.html ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [fetchingAttachments, setFetchingAttachments] = useState(false);
  const [missingAttachmentNames, setMissingAttachmentNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const draftIdRef = useRef<string | undefined>(draft?.id);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    Promise.all([getPersonalContacts(), getGlobalContacts(), getMdlMembers()]).then(([personal, global, members]) => {
      // personal > global > members 우선순위로 머지, 빈 필드는 하위 항목으로 보완
      const emailMap = new Map<string, typeof personal[0]>();
      for (const c of [...members, ...global, ...personal]) {
        const existing = emailMap.get(c.email);
        emailMap.set(c.email, existing ? {
          ...existing,
          ...c,
          name: c.name || existing.name,
          company: c.company || existing.company,
        } : c);
      }
      setContacts([...emailMap.values()]);
    });
  }, []);

  // 서명 자동 삽입 (임시저장 불러오기는 제외)
  useEffect(() => {
    if (draft) return;
    if (!mailEmail) return;
    getSignature().then((sig) => {
      if (!sig) return;
      const initHtml = init?.html ?? "";
      setHtml(initHtml ? `<br>${sig}${initHtml}` : sig);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fwd = init?.forwardAttachments;
    if (!fwd?.length) return;
    const fetchable = fwd.filter((a) => a.r2Key);
    const missing = fwd.filter((a) => !a.r2Key).map((a) => a.name);
    setMissingAttachmentNames(missing);
    if (!fetchable.length) return;
    setFetchingAttachments(true);
    Promise.all(
      fetchable.map(async (att) => {
        try {
          const res = await fetch(`/api/attachment?key=${encodeURIComponent(att.r2Key!)}`);
          if (!res.ok) return null;
          const blob = await res.blob();
          return new File([blob], att.name, { type: att.contentType ?? blob.type });
        } catch {
          return null;
        }
      })
    ).then((results) => {
      const fetched = results.filter((f): f is File => f !== null);
      if (fetched.length) setFiles((prev) => [...prev, ...fetched]);
    }).finally(() => setFetchingAttachments(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(list: FileList | File[]) {
    const picked = Array.from(list);
    if (picked.length) setFiles((prev) => [...prev, ...picked]);
  }

  // 자식 요소 개수를 세는 카운터 방식은 Jodit처럼 드래그 도중 내부 DOM이 바뀌는 자식 위에서
  // enter/leave 짝이 어긋나 오버레이가 안 꺼지는 문제가 있었다. relatedTarget(마우스가 다음에
  // 들어가는 요소)이 컨테이너 밖일 때만 꺼지도록 하면 DOM 변화와 무관하게 정확하다.
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) return;
    setIsDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    const next = e.relatedTarget as Node | null;
    if (!next || !e.currentTarget.contains(next)) setIsDragging(false);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }

  useEffect(() => { isDirtyRef.current = true; }, [to, cc, bcc, subject, html]);

  // cc/bcc도 의존성에 넣어야 자동저장 콜백이 최신 참조 값을 캡처한다.
  useEffect(() => {
    const interval = setInterval(() => {
      if (isDirtyRef.current) handleSaveDraft();
    }, 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, bcc, subject, html]);

  async function handleSaveDraft() {
    if (!mailEmail) return;
    setSaving(true);
    try {
      const id = await saveDraft({
        id: draftIdRef.current,
        userEmail: mailEmail,
        to: to.join(", "),
        cc: cc.join(", "),
        bcc: bcc.join(", "),
        subject,
        html,
      });
      draftIdRef.current = id;
      isDirtyRef.current = false;
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    if (to.length === 0 || !subject) { setError("받는 사람과 제목을 입력해주세요."); return; }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 10 * 1024 * 1024) {
      setError("첨부파일 합계가 10MB를 초과합니다. 파일을 줄여주세요.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const token = await getIdToken(auth.currentUser!);

      const attachments = await Promise.all(
        files.map(async (file) => {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          return { filename: file.name, content: btoa(binary) };
        })
      );

      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to,
          ...(cc.length > 0 ? { cc } : {}),
          ...(bcc.length > 0 ? { bcc } : {}),
          subject,
          text: "",
          html,
          attachments,
        }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = {};
      try { data = await res.json(); } catch { /* empty/non-JSON response */ }
      if (!res.ok) { setError(data.error ?? `서버 오류 (${res.status})`); return; }

      await saveSentMail(data.sentMail);
      if (draftIdRef.current) await deleteDraft(draftIdRef.current);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "발송 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-end justify-end p-0 lg:p-6 z-50">
      <div className="relative w-full max-w-2xl bg-white rounded-t-2xl lg:rounded-2xl shadow-xl flex flex-col h-[90dvh] lg:h-[620px]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
          <span className="text-sm font-medium text-zinc-900">새 메일</span>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">✕</button>
        </div>

        {/* 수신/제목 */}
        <div className="flex flex-col border-b border-zinc-100">
          <div className="flex items-center border-b border-zinc-100">
            <EmailChipInput values={to} onChange={setTo} placeholder="받는 사람" contacts={contacts} />
            <div className="flex gap-2 pr-3 shrink-0 text-xs text-zinc-400">
              <button
                type="button"
                onClick={() => { const me = mailEmail; if (me && !to.includes(me)) setTo([...to, me]); }}
                className="hover:text-zinc-600"
              >
                나에게
              </button>
              {!showCc && <button onClick={() => setShowCc(true)} className="hover:text-zinc-600">참조</button>}
              {!showBcc && <button onClick={() => setShowBcc(true)} className="hover:text-zinc-600">숨은참조</button>}
            </div>
          </div>
          {showCc && (
            <div className="flex items-center border-b border-zinc-100">
              <span className="pl-4 text-xs text-zinc-400 shrink-0">참조</span>
              <EmailChipInput values={cc} onChange={setCc} placeholder="참조 (CC)" contacts={contacts} />
            </div>
          )}
          {showBcc && (
            <div className="flex items-center border-b border-zinc-100">
              <span className="pl-4 text-xs text-zinc-400 shrink-0">숨은참조</span>
              <EmailChipInput values={bcc} onChange={setBcc} placeholder="숨은참조 (BCC)" contacts={contacts} />
            </div>
          )}
          <input
            type="text"
            placeholder="제목"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="px-4 py-2.5 text-sm text-black placeholder-zinc-400 outline-none"
          />
        </div>

        {/* 에디터 */}
        <div className="flex-1 overflow-hidden">
          <RichEditor value={html} onChange={setHtml} />
        </div>

        {/* 첨부파일 — 에디터와 겹치지 않는 별도 한 줄짜리 드롭 영역 */}
        <div className="px-4 py-2 border-t border-zinc-100">
          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`flex items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 transition-colors ${isDragging ? "border-zinc-400 bg-zinc-50" : "border-zinc-200"}`}
          >
            <span className="text-xs font-semibold text-zinc-900 shrink-0">파일첨부</span>
            <span className="flex-1 text-xs text-zinc-400">여기에 파일을 끌어다 놓으세요</span>
            <label className="cursor-pointer shrink-0 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
              직접 첨부
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
              />
            </label>
          </div>
          {(fetchingAttachments || files.length > 0 || missingAttachmentNames.length > 0) && (
            <div className="flex flex-wrap gap-1 mt-1">
              {fetchingAttachments && (
                <span className="text-xs text-zinc-400 px-2 py-0.5">첨부파일 가져오는 중...</span>
              )}
              {files.map((f, i) => (
                <span key={i} className="flex items-center gap-1 text-xs text-zinc-900 bg-zinc-100 rounded px-2 py-0.5">
                  {f.name}
                  <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-zinc-400 hover:text-zinc-600">✕</button>
                </span>
              ))}
              {missingAttachmentNames.map((name, i) => (
                <span key={i} className="flex items-center gap-1 text-xs text-zinc-400 bg-zinc-50 border border-zinc-200 rounded px-2 py-0.5" title="원본 첨부파일을 찾을 수 없어 직접 첨부해주세요">
                  {name} (재첨부 필요)
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 하단 */}
        <div className="px-4 py-3 border-t border-zinc-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {error && <p className="text-xs text-red-500">{error}</p>}
            {!error && savedAt && (
              <p className="text-xs text-zinc-400">
                {savedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 임시저장됨
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              {saving ? "저장 중..." : "임시저장"}
            </button>
            <button
              onClick={handleSend}
              disabled={loading}
              className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {loading ? "발송 중..." : "보내기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
