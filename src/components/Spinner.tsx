interface Props {
  /** 지름(px). 기본값은 본문 텍스트 옆에 놓기 좋은 크기. */
  size?: number;
  className?: string;
}

export default function Spinner({ size = 14, className = "" }: Props) {
  return (
    <span
      role="status"
      aria-label="로딩 중"
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 7)) }}
      className={`inline-block rounded-full border-current/25 border-t-current animate-spin ${className}`}
    />
  );
}
