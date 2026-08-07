import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/mail";

// 기기별 화면 설정이라 서버가 아니라 localStorage에 둔다.
const PAGE_SIZE_KEY = "mailer.pageSize";
const PAGE_SIZE_EVENT = "mailer:pageSize";

export function getPageSize(): number {
  if (typeof window === "undefined") return DEFAULT_PAGE_SIZE;
  const raw = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw) ? raw : DEFAULT_PAGE_SIZE;
}

export function setPageSize(size: number) {
  window.localStorage.setItem(PAGE_SIZE_KEY, String(size));
  window.dispatchEvent(new Event(PAGE_SIZE_EVENT));
}

// storage 이벤트는 다른 탭에서만 발생하므로, 같은 탭 반영을 위해 커스텀 이벤트도 함께 듣는다.
export function subscribePageSize(callback: (size: number) => void): () => void {
  const onChange = () => callback(getPageSize());
  window.addEventListener(PAGE_SIZE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PAGE_SIZE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// 앱 화면(UI) 폰트 — 메일 본문에는 적용되지 않는다. globals.css의 [data-font] 규칙 참고.
export const UI_FONT_OPTIONS = ["lineseed", "pretendard"] as const;
export type UiFont = (typeof UI_FONT_OPTIONS)[number];
const DEFAULT_UI_FONT: UiFont = "pretendard";
const FONT_KEY = "mailer.font";
const FONT_EVENT = "mailer:font";

export function getUiFont(): UiFont {
  if (typeof window === "undefined") return DEFAULT_UI_FONT;
  const raw = window.localStorage.getItem(FONT_KEY);
  return (UI_FONT_OPTIONS as readonly string[]).includes(raw ?? "") ? (raw as UiFont) : DEFAULT_UI_FONT;
}

export function setUiFont(font: UiFont) {
  window.localStorage.setItem(FONT_KEY, font);
  document.documentElement.setAttribute("data-font", font);
  window.dispatchEvent(new Event(FONT_EVENT));
}

export function subscribeUiFont(callback: (font: UiFont) => void): () => void {
  const onChange = () => callback(getUiFont());
  window.addEventListener(FONT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(FONT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
