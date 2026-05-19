"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

const USE_SMTP = process.env.NEXT_PUBLIC_MAIL_TRANSPORT === "smtp";

export default function SignupPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [idStatus, setIdStatus] = useState<"idle" | "checking" | "ok" | "taken" | "error">("idle");
  const [idMessage, setIdMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const passwordMatch =
    passwordConfirm.length > 0 && password === passwordConfirm;
  const passwordMismatch =
    passwordConfirm.length > 0 && password !== passwordConfirm;

  const checkId = useCallback(async (value: string) => {
    if (!value) { setIdStatus("idle"); setIdMessage(""); return; }
    setIdStatus("checking");
    const res = await fetch(`/api/check-id?id=${encodeURIComponent(value)}`);
    const data = await res.json();
    if (data.error) {
      setIdStatus("error");
      setIdMessage(data.error);
    } else if (data.available) {
      setIdStatus("ok");
      setIdMessage(`${value}@${process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr"} 사용 가능`);
    } else {
      setIdStatus("taken");
      setIdMessage("이미 사용 중인 아이디입니다.");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!USE_SMTP && idStatus !== "ok") { setError("아이디 중복 확인을 해주세요."); return; }
    if (password !== passwordConfirm) { setError("비밀번호가 일치하지 않습니다."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setDone(true);
    } catch {
      setError("오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 text-center">
          <p className="text-zinc-900 font-medium mb-2">
            {USE_SMTP ? "계정 등록 완료" : "가입 신청 완료"}
          </p>
          <p className="text-sm text-zinc-500 mb-6">
            {USE_SMTP ? "로그인하세요." : "관리자 승인 후 로그인 가능합니다."}
          </p>
          <button onClick={() => router.push("/")} className="text-sm text-zinc-500 hover:text-zinc-900">
            로그인으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
        <h1 className="text-xl font-semibold text-zinc-900 mb-6">
          {USE_SMTP ? "계정 등록" : `${process.env.NEXT_PUBLIC_MAIL_DOMAIN || "mdl.kr"} 가입 신청`}
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {USE_SMTP ? (
            /* SMTP 모드: 풀 이메일 입력 */
            <input
              type="email"
              placeholder="이메일 주소 (예: shy@wm.co.kr)"
              value={id}
              onChange={(e) => setId(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 text-sm text-black placeholder-zinc-400 outline-none focus:border-zinc-400"
            />
          ) : (
            /* 기존 모드: username + @domain */
            <div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="아이디 (영문 소문자/숫자)"
                  value={id}
                  onChange={(e) => { setId(e.target.value); setIdStatus("idle"); setIdMessage(""); }}
                  required
                  className="flex-1 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm text-black placeholder-zinc-400 outline-none focus:border-zinc-400"
                />
                <button
                  type="button"
                  onClick={() => checkId(id)}
                  disabled={!id || idStatus === "checking"}
                  className="rounded-lg border border-zinc-200 px-3 py-2.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 shrink-0"
                >
                  중복확인
                </button>
              </div>
              {idMessage && (
                <p className={`text-xs mt-1 ${idStatus === "ok" ? "text-green-600" : "text-red-500"}`}>
                  {idMessage}
                </p>
              )}
              <p className="text-xs text-zinc-400 mt-1">
                가입 후 이메일: {id || "아이디"}@{process.env.NEXT_PUBLIC_MAIL_DOMAIN || "mdl.kr"}
              </p>
            </div>
          )}

          {/* 이름 */}
          <input
            type="text"
            placeholder="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 text-sm text-black placeholder-zinc-400 outline-none focus:border-zinc-400"
          />

          {/* 개인 이메일 — 기존 모드에서만 */}
          {!USE_SMTP && (
          <input
            type="email"
            placeholder="개인 이메일 (비밀번호 찾기용)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 text-sm text-black placeholder-zinc-400 outline-none focus:border-zinc-400"
          />
          )}

          {/* 비밀번호 */}
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="비밀번호 (6자 이상)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 pr-10 text-sm text-black placeholder-zinc-400 outline-none focus:border-zinc-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* 비밀번호 확인 */}
          <div>
            <div className="relative">
              <input
                type={showPasswordConfirm ? "text" : "password"}
                placeholder="비밀번호 확인"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                minLength={6}
                className={`w-full rounded-lg border px-4 py-2.5 pr-10 text-sm text-black placeholder-zinc-400 outline-none focus:border-zinc-400 ${
                  passwordMatch
                    ? "border-green-400"
                    : passwordMismatch
                    ? "border-red-400"
                    : "border-zinc-200"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPasswordConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                tabIndex={-1}
              >
                {showPasswordConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passwordMatch && (
              <p className="text-xs mt-1 text-green-600">비밀번호가 일치합니다.</p>
            )}
            {passwordMismatch && (
              <p className="text-xs mt-1 text-red-500">비밀번호가 일치하지 않습니다.</p>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading || passwordMismatch}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? "신청 중..." : "가입 신청"}
          </button>
        </form>
        <button onClick={() => router.push("/")} className="w-full mt-4 text-sm text-zinc-400 hover:text-zinc-600">
          로그인으로 돌아가기
        </button>
      </div>
    </div>
  );
}
