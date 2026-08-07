import Spinner from "@/components/Spinner";

// 행마다 폭을 조금씩 다르게 줘야 진짜 목록처럼 보인다. 렌더마다 흔들리면 안 되므로 고정값.
const ROWS = [
  { sender: "38%", subject: "72%" },
  { sender: "52%", subject: "58%" },
  { sender: "30%", subject: "85%" },
  { sender: "45%", subject: "66%" },
  { sender: "34%", subject: "78%" },
  { sender: "48%", subject: "52%" },
  { sender: "36%", subject: "70%" },
];

interface Props {
  rows?: number;
  label?: string;
}

export default function MailListSkeleton({ rows = ROWS.length, label = "메일을 불러오는 중" }: Props) {
  return (
    <div aria-busy="true" aria-live="polite">
      {ROWS.slice(0, rows).map((r, i) => (
        <div
          key={i}
          className="skeleton-row flex items-stretch border-b border-zinc-100"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="flex items-center pl-3 pr-1 w-8 shrink-0">
            <span className="skeleton-bar block w-[15px] h-[15px] rounded-sm" />
          </div>
          <div className="flex-1 px-3 py-4 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <span className="skeleton-bar block h-2.5" style={{ width: r.sender }} />
              <span className="skeleton-bar block h-2.5 w-8 ml-2 shrink-0" />
            </div>
            <span className="skeleton-bar block h-3.5" style={{ width: r.subject }} />
          </div>
        </div>
      ))}
      <div className="flex items-center justify-center gap-2 py-4 text-xs text-zinc-400">
        <Spinner size={13} />
        {label}
      </div>
    </div>
  );
}
