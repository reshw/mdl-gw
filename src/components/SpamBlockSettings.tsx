"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { fetchSpamBlocks, addSpamBlock, removeSpamBlock, type SpamBlocks } from "@/lib/spam";

// 설정 > 스팸 차단. 여기 등록된 주소·도메인에서 오는 메일은 수신 워커가 스팸함에 넣는다.
export default function SpamBlockSettings() {
  const [blocks, setBlocks] = useState<SpamBlocks | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function reload() {
    try {
      setBlocks(await fetchSpamBlocks());
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
      setBlocks({ addresses: [], domains: [] });
    }
  }

  useEffect(() => { reload(); }, []);

  async function handleAdd() {
    if (!input.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await addSpamBlock(input);
      setInput("");
      setMsg({ text: "차단했습니다. 앞으로 받는 메일부터 스팸함으로 갑니다.", ok: true });
      await reload();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(value: string) {
    setBusy(true);
    setMsg(null);
    try {
      await removeSpamBlock(value);
      await reload();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  }

  const rows = blocks
    ? [
        ...blocks.domains.map((v) => ({ value: v, kind: "도메인" })),
        ...blocks.addresses.map((v) => ({ value: v, kind: "주소" })),
      ]
    : [];

  return (
    <>
      <h1 className="text-lg font-semibold text-zinc-900 mb-6">스팸 차단</h1>
      <section className="bg-white rounded-2xl border border-zinc-200 p-6 max-w-2xl mb-4">
        <h2 className="text-sm font-medium text-zinc-900 mb-1">차단 추가</h2>
        <p className="text-xs text-zinc-400 mb-4">
          메일 주소(spam@example.com) 또는 도메인(example.com)을 입력하세요. 도메인을 막으면 그 하위 도메인까지 막힙니다.
          받은편지함에서 &lsquo;스팸 신고&rsquo;를 누르면 보낸 주소가 자동으로 여기 추가됩니다.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAdd(); }}
            placeholder="spam@example.com 또는 example.com"
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-zinc-200 text-black placeholder-zinc-400 outline-none focus:border-zinc-400"
          />
          <button
            onClick={handleAdd}
            disabled={busy || !input.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            차단
          </button>
        </div>
        {msg && <p className={`text-xs mt-3 ${msg.ok ? "text-zinc-500" : "text-red-500"}`}>{msg.text}</p>}
      </section>

      <section className="bg-white rounded-2xl border border-zinc-200 p-6 max-w-2xl mb-4">
        <h2 className="text-sm font-medium text-zinc-900 mb-4">차단 목록 {blocks && rows.length > 0 && <span className="text-zinc-400 font-normal">({rows.length})</span>}</h2>
        {blocks === null ? (
          <p className="text-xs text-zinc-400">불러오는 중...</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-zinc-400">차단한 주소가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <li key={r.kind + r.value} className="flex items-center gap-3 py-2">
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 shrink-0">{r.kind}</span>
                <span className="flex-1 text-sm text-zinc-800 truncate">{r.value}</span>
                <button
                  onClick={() => handleRemove(r.value)}
                  disabled={busy}
                  className="text-zinc-400 hover:text-red-500 disabled:opacity-50"
                  title="차단 해제"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-zinc-50 rounded-2xl border border-zinc-200 p-6 max-w-2xl">
        <h2 className="text-sm font-medium text-zinc-900 mb-1">자동 분류</h2>
        <p className="text-xs text-zinc-500">
          차단 목록과 별개로, 발신자 인증(SPF·DKIM·DMARC)에 실패한 사칭 의심 메일은 자동으로 스팸함에 들어가고 알림도 오지 않습니다.
          정상 메일이 잘못 들어갔다면 스팸함에서 &lsquo;스팸 아님&rsquo;을 누르세요.
        </p>
      </section>
    </>
  );
}
