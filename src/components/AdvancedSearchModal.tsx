"use client";

import { useState } from "react";
import type { AdvancedSearchOpts } from "@/lib/mail";
import Spinner from "@/components/Spinner";

interface Props {
  onClose: () => void;
  onSearch: (opts: AdvancedSearchOpts) => void;
  searching: boolean;
  error: string | null;
}

type Period = "all" | "1w" | "1m" | "3m" | "6m" | "1y" | "custom";

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function periodToRange(period: Period): { from?: string; to?: string } {
  if (period === "all" || period === "custom") return {};
  const to = new Date();
  const from = new Date();
  if (period === "1w") from.setDate(from.getDate() - 7);
  if (period === "1m") from.setMonth(from.getMonth() - 1);
  if (period === "3m") from.setMonth(from.getMonth() - 3);
  if (period === "6m") from.setMonth(from.getMonth() - 6);
  if (period === "1y") from.setFullYear(from.getFullYear() - 1);
  return { from: toDateInputValue(from), to: toDateInputValue(to) };
}

const PERIOD_LABELS: Record<Period, string> = {
  all: "전체",
  "1w": "1주",
  "1m": "1개월",
  "3m": "3개월",
  "6m": "6개월",
  "1y": "1년",
  custom: "직접설정",
};

export default function AdvancedSearchModal({ onClose, onSearch, searching, error }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [toScope, setToScope] = useState<"to_cc" | "to" | "cc">("to_cc");
  const [subject, setSubject] = useState("");
  const [contentScope, setContentScope] = useState<"subject" | "subject_content">("subject");
  const [hasAttachment, setHasAttachment] = useState<"all" | "yes" | "no">("all");
  const [includeSubfolders, setIncludeSubfolders] = useState(false);
  const [period, setPeriod] = useState<Period>("all");
  const [customRange, setCustomRange] = useState<{ from: string; to: string }>(() => {
    const r = periodToRange("1w");
    return { from: r.from ?? "", to: r.to ?? "" };
  });

  function handlePeriodChange(p: Period) {
    setPeriod(p);
    if (p !== "custom" && p !== "all") {
      const r = periodToRange(p);
      setCustomRange({ from: r.from ?? "", to: r.to ?? "" });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const range = period === "all" ? { from: "", to: "" } : customRange;
    onSearch({
      from: from.trim() || undefined,
      to: to.trim() || undefined,
      toScope,
      subject: subject.trim() || undefined,
      contentScope,
      hasAttachment,
      includeSubfolders,
      dateFrom: range.from || undefined,
      dateTo: range.to || undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="absolute right-0 top-full mt-2 w-[min(440px,92vw)] bg-white border border-zinc-200 rounded-xl shadow-xl z-30 p-4 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-zinc-900">상세검색</h2>
        <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-sm">✕</button>
      </div>

      <fieldset disabled={searching} className="contents">
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5 items-center text-xs">
          <label className="text-zinc-500 justify-self-end">보낸사람</label>
          <input
            type="text"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="이름 또는 이메일 주소"
            className="px-3 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-black placeholder-zinc-400 outline-none focus:border-zinc-400"
          />

          <label className="text-zinc-500 justify-self-end">받는사람</label>
          <div className="flex gap-2">
            <select
              value={toScope}
              onChange={(e) => setToScope(e.target.value as typeof toScope)}
              className="px-2 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-black outline-none focus:border-zinc-400 shrink-0"
            >
              <option value="to_cc">받는사람+참조</option>
              <option value="to">받는사람</option>
              <option value="cc">참조</option>
            </select>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="이름 또는 이메일 주소"
              className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-black placeholder-zinc-400 outline-none focus:border-zinc-400"
            />
          </div>

          <label className="text-zinc-500 justify-self-end">첨부파일</label>
          <div className="flex items-center gap-3">
            <select
              value={hasAttachment}
              onChange={(e) => setHasAttachment(e.target.value as typeof hasAttachment)}
              className="px-2 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-black outline-none focus:border-zinc-400"
            >
              <option value="all">전체</option>
              <option value="yes">있음</option>
              <option value="no">없음</option>
            </select>
            <label className="flex items-center gap-1.5 text-zinc-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeSubfolders}
                onChange={() => setIncludeSubfolders((v) => !v)}
                className="accent-zinc-800"
              />
              하위 폴더 포함
            </label>
          </div>

          <label className="text-zinc-500 justify-self-end">제목</label>
          <div className="flex gap-2">
            <select
              value={contentScope}
              onChange={(e) => setContentScope(e.target.value as typeof contentScope)}
              className="px-2 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-black outline-none focus:border-zinc-400 shrink-0"
            >
              <option value="subject">제목</option>
              <option value="subject_content">제목+내용</option>
            </select>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="검색어"
              className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-black placeholder-zinc-400 outline-none focus:border-zinc-400"
            />
          </div>

          <label className="text-zinc-500 justify-self-end">기간</label>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value as Period)}
              className="px-2 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-black outline-none focus:border-zinc-400"
            >
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
              ))}
            </select>
            {period !== "all" && (
              <>
                <input
                  type="date"
                  value={customRange.from}
                  onChange={(e) => { setPeriod("custom"); setCustomRange((r) => ({ ...r, from: e.target.value })); }}
                  className="px-2 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-black outline-none focus:border-zinc-400"
                />
                <span className="text-zinc-400">~</span>
                <input
                  type="date"
                  value={customRange.to}
                  onChange={(e) => { setPeriod("custom"); setCustomRange((r) => ({ ...r, to: e.target.value })); }}
                  className="px-2 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-black outline-none focus:border-zinc-400"
                />
              </>
            )}
          </div>
        </div>
      </fieldset>

      {error && <p className="text-xs text-red-500">검색 실패: {error}</p>}

      <div className="flex items-center justify-end gap-2 mt-2">
        {searching && <span className="text-xs text-zinc-400 mr-auto">검색 중...</span>}
        <button
          type="button"
          onClick={onClose}
          disabled={searching}
          className="text-xs px-4 py-2 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={searching}
          className="text-xs px-4 py-2 rounded-lg bg-zinc-900 text-white font-medium hover:bg-zinc-700 disabled:opacity-50 flex items-center gap-1.5"
        >
          {searching && <Spinner size={12} />}
          {searching ? "검색 중..." : "검색"}
        </button>
      </div>
    </form>
  );
}
