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

interface ShareRequest {
  email: string;
  name: string;
  requestedAt: string;
}

interface StorageData {
  totalDocs: number;
  tenantCounts: { email: string; label: string; count: number }[];
  reads: number | null;
  writes: number | null;
  limits: { reads_per_day: number; writes_per_day: number; storage_gib: number };
}

interface RoutingLog {
  email: string;
  success: boolean;
  error: string;
  createdAt: string;
}

export default function AdminPage() {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [storage, setStorage] = useState<StorageData | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [shareRequests, setShareRequests] = useState<ShareRequest[]>([]);
  const [shareProcessing, setShareProcessing] = useState<string | null>(null);
  const [routingLogs, setRoutingLogs] = useState<RoutingLog[]>([]);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [user, loading, isAdmin, router]);

  const fetchRequests = useCallback(async () => {
    const token = await getIdToken(auth.currentUser!);
    const [res, shareRes, routingRes] = await Promise.all([
      fetch("/api/admin/requests", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/admin/share-requests", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/admin/routing-logs", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (res.ok) {
      const data = await res.json();
      setRequests(data.requests ?? []);
    }
    if (shareRes.ok) {
      const data = await shareRes.json();
      setShareRequests(data.requests ?? []);
    }
    if (routingRes.ok) {
      const data = await routingRes.json();
      setRoutingLogs(data.logs ?? []);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchRequests();
  }, [user, fetchRequests]);

  async function handleShareAction(email: string, action: "approve" | "reject") {
    setShareProcessing(email);
    try {
      const token = await getIdToken(auth.currentUser!);
      const endpoint = action === "approve" ? "/api/admin/approve-share" : "/api/admin/reject-share";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error);
      else setShareRequests((prev) => prev.filter((r) => r.email !== email));
    } catch {
      alert("처리 중 오류가 발생했습니다.");
    } finally {
      setShareProcessing(null);
    }
  }

  async function fetchStorage() {
    setStorageLoading(true);
    try {
      const token = await getIdToken(auth.currentUser!);
      const res = await fetch("/api/admin/storage", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setStorage(await res.json());
    } finally {
      setStorageLoading(false);
    }
  }

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
              onClick={() => router.push("/admin/setup")}
              className="text-xs text-zinc-500 hover:text-zinc-900 border border-zinc-200 px-3 py-1.5 rounded-lg hover:bg-zinc-50"
            >
              신규 테넌트 설정
            </button>
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
        {routingLogs.length > 0 && (
          <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900 mb-3">
              이메일 라우팅 자동 설정 로그 (최근 {routingLogs.length}건)
            </h2>
            <div className="flex flex-col gap-2">
              {routingLogs.map((log, i) => (
                <div
                  key={i}
                  className={`text-xs rounded-lg border p-3 ${
                    log.success ? "bg-zinc-50 border-zinc-100" : "bg-red-50 border-red-100"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className={log.success ? "text-emerald-600" : "text-red-600"}>
                        {log.success ? "✓ 성공" : "✕ 실패"}
                      </span>
                      <span className="font-medium text-zinc-900">{log.email}</span>
                    </span>
                    <span className="text-zinc-400">{new Date(log.createdAt).toLocaleString("ko-KR")}</span>
                  </div>
                  {!log.success && <p className="text-red-600 mt-1 break-all">{log.error}</p>}
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-400 mt-3">
              실패 건은 Cloudflare Email Routing 룰이 자동 생성되지 않은 것이니 대시보드에서 수동으로 확인해주세요.
            </p>
          </div>
        )}

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

        {/* 같이쓰기 신청 */}
        {shareRequests.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">같이쓰기 신청</h2>
            <div className="flex flex-col gap-3">
              {shareRequests.map((req) => (
                <div key={req.email} className="bg-white rounded-xl border border-zinc-200 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{req.name}</p>
                    <p className="text-xs text-zinc-500">{req.email}</p>
                    <p className="text-xs text-zinc-400">{new Date(req.requestedAt).toLocaleString("ko-KR")}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleShareAction(req.email, "approve")}
                      disabled={shareProcessing === req.email}
                      className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                    >
                      승인
                    </button>
                    <button
                      onClick={() => handleShareAction(req.email, "reject")}
                      disabled={shareProcessing === req.email}
                      className="rounded-lg border border-zinc-200 px-4 py-2 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      거절
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Firestore 사용량 */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-900">Firestore 사용량</h2>
            <button
              onClick={fetchStorage}
              disabled={storageLoading}
              className="text-xs text-zinc-500 hover:text-zinc-900 border border-zinc-200 px-3 py-1.5 rounded-lg hover:bg-zinc-50 disabled:opacity-50"
            >
              {storageLoading ? "조회 중..." : "조회"}
            </button>
          </div>

          {storage && (
            <div className="flex flex-col gap-4">
              {/* 읽기/쓰기 */}
              <div className="bg-white rounded-xl border border-zinc-200 p-5 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-zinc-400 mb-1">오늘 읽기</p>
                  {storage.reads !== null && storage.reads >= 0 ? (
                    <>
                      <p className="text-xl font-semibold text-zinc-900">{storage.reads.toLocaleString()}</p>
                      <div className="mt-2 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-zinc-900 rounded-full"
                          style={{ width: `${Math.min(100, (storage.reads / storage.limits.reads_per_day) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">한도 {storage.limits.reads_per_day.toLocaleString()}회/일</p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-400">Monitoring API 권한 필요</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-zinc-400 mb-1">오늘 쓰기</p>
                  {storage.writes !== null && storage.writes >= 0 ? (
                    <>
                      <p className="text-xl font-semibold text-zinc-900">{storage.writes.toLocaleString()}</p>
                      <div className="mt-2 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-zinc-900 rounded-full"
                          style={{ width: `${Math.min(100, (storage.writes / storage.limits.writes_per_day) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">한도 {storage.limits.writes_per_day.toLocaleString()}회/일</p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-400">Monitoring API 권한 필요</p>
                  )}
                </div>
              </div>

              {/* 테넌트별 메일 수 */}
              <div className="bg-white rounded-xl border border-zinc-200 p-5">
                <div className="flex items-baseline justify-between mb-3">
                  <p className="text-xs text-zinc-400">저장된 메일 (전체 {storage.totalDocs.toLocaleString()}통 · 추정 {(storage.totalDocs * 5 / 1024).toFixed(1)} MB / 1,024 MB)</p>
                </div>
                <div className="mb-3 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-zinc-900 rounded-full"
                    style={{ width: `${Math.min(100, (storage.totalDocs * 5 / 1024 / 1024) * 100)}%` }}
                  />
                </div>
                <div className="flex flex-col gap-2 mt-4">
                  {storage.tenantCounts.map((t) => (
                    <div key={t.email} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-700">{t.label}</span>
                      <span className="text-zinc-500">{t.count.toLocaleString()}통</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
