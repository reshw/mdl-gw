"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface SignupRequest {
  docId: string;
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

export default function AdminPage() {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [user, loading, isAdmin, router]);

  const fetchRequests = useCallback(async () => {
    const token = await getIdToken(auth.currentUser!);
    const res = await fetch("/api/admin/requests", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setRequests(data.requests ?? []);
  }, []);

  useEffect(() => {
    if (user?.email === ADMIN_EMAIL) fetchRequests();
  }, [user, fetchRequests]);

  async function handleAction(requestId: string, action: "approve" | "reject") {
    setProcessing(requestId);
    try {
      const token = await getIdToken(auth.currentUser!);
      const res = await fetch(`/api/admin/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error);
      else {
        if (action === "approve") alert(`${data.email} 계정이 생성되었습니다.`);
        setRequests((prev) => prev.filter((r) => r.docId !== requestId));
      }
    } catch {
      alert("처리 중 오류가 발생했습니다.");
    } finally {
      setProcessing(null);
    }
  }

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold text-zinc-900">가입 승인</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                setMigrating(true);
                try {
                  const token = await getIdToken(auth.currentUser!);
                  const res = await fetch("/api/admin/migrate-members", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  const data = await res.json();
                  if (res.ok) alert(`멤버 마이그레이션 완료: ${data.count}명`);
                  else alert(data.error);
                } finally {
                  setMigrating(false);
                }
              }}
              disabled={migrating}
              className="text-xs text-zinc-500 hover:text-zinc-900 border border-zinc-200 px-3 py-1.5 rounded-lg hover:bg-zinc-50 disabled:opacity-50"
            >
              {migrating ? "마이그레이션 중..." : "멤버 마이그레이션"}
            </button>
            <button onClick={() => router.push("/mail")} className="text-sm text-zinc-500 hover:text-zinc-900">
              메일함으로
            </button>
          </div>
        </div>
        {requests.length === 0 ? (
          <p className="text-sm text-zinc-400">대기 중인 가입 신청이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {requests.map((req) => (
              <div key={req.docId} className="bg-white rounded-xl border border-zinc-200 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{req.name}</p>
                  <p className="text-xs text-zinc-500">{req.id}@{process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr"}</p>
                  <p className="text-xs text-zinc-400">{new Date(req.createdAt).toLocaleString("ko-KR")}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction(req.docId, "approve")}
                    disabled={processing === req.docId}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                  >
                    승인
                  </button>
                  <button
                    onClick={() => handleAction(req.docId, "reject")}
                    disabled={processing === req.docId}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
