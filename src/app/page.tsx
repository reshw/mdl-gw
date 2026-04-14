"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { sha256 } from "@/lib/hash";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const hashed = await sha256(password);
      await signInWithEmailAndPassword(auth, email, hashed);
      router.push("/mail");
    } catch {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 relative">
        <h1 className="text-xl font-semibold text-zinc-900 mb-6">{process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr"} 메일</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 text-sm text-black placeholder-zinc-400 outline-none focus:border-zinc-400"
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 text-sm text-black placeholder-zinc-400 outline-none focus:border-zinc-400"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>
        <button onClick={() => router.push("/signup")} className="w-full mt-4 text-sm text-zinc-400 hover:text-zinc-600">
          가입 신청
        </button>
        <p className="absolute bottom-3 right-4 text-xs text-zinc-300">v.260415-1</p>
      </div>
    </div>
  );
}
