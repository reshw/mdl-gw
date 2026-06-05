import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, assertAdmin } from "@/lib/firebase-admin";
import { getApp } from "firebase-admin/app";

async function getAccessToken(): Promise<string> {
  const app = getApp();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { access_token } = await (app.options.credential as any).getAccessToken();
  return access_token;
}

async function fetchMonitoringMetric(projectId: string, token: string, metricType: string): Promise<number> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    filter: `metric.type="${metricType}"`,
    "interval.startTime": yesterday.toISOString(),
    "interval.endTime": now.toISOString(),
    "aggregation.alignmentPeriod": "86400s",
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
  });

  const res = await fetch(
    `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) return -1;
  const data = await res.json();
  const points = data.timeSeries?.[0]?.points ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return points.reduce((sum: number, p: any) => {
    const v = p.value;
    return sum + Number(v?.int64Value ?? v?.doubleValue ?? 0);
  }, 0);
}

export async function GET(req: NextRequest) {
  const authToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!authToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await assertAdmin(authToken).catch(() => false);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID!;

  // 전체 메일 수 + 테넌트 목록 병렬 조회
  const [totalSnap, tenantsSnap] = await Promise.all([
    adminDb.collection("mails").count().get(),
    adminDb.collection("tenants").get(),
  ]);

  const totalDocs = totalSnap.data().count;

  // 테넌트별 메일 수
  const tenantCounts = await Promise.all(
    tenantsSnap.docs.map(async (doc) => {
      const email = doc.id;
      const snap = await adminDb.collection("mails").where("deliveredTo", "==", email).count().get();
      return { email, label: doc.data().label || email, count: snap.data().count };
    })
  );

  // Cloud Monitoring — 오늘 읽기/쓰기 횟수
  let reads: number | null = null;
  let writes: number | null = null;
  try {
    const accessToken = await getAccessToken();
    [reads, writes] = await Promise.all([
      fetchMonitoringMetric(projectId, accessToken, "firestore.googleapis.com/document/read_count"),
      fetchMonitoringMetric(projectId, accessToken, "firestore.googleapis.com/document/write_count"),
    ]);
  } catch {
    // Monitoring API 권한 없으면 null로 표시
  }

  return NextResponse.json({
    totalDocs,
    tenantCounts: tenantCounts.sort((a, b) => b.count - a.count),
    reads,
    writes,
    limits: { reads_per_day: 50_000, writes_per_day: 20_000, storage_gib: 1 },
  });
}
