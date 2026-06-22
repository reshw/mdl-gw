import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

// .env.local 파싱
const env = {};
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
}

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const db = getFirestore();

async function migrate() {
  const snap = await db.collection("mails").get();
  const needs = snap.docs.filter((d) => !d.data().deliveredTo);

  console.log(`전체 ${snap.size}건, deliveredTo 없는 것 ${needs.length}건`);

  if (needs.length === 0) {
    console.log("마이그레이션 필요 없음");
    return;
  }

  // Firestore 배치는 500건 제한
  const BATCH_SIZE = 400;
  let done = 0;
  for (let i = 0; i < needs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const d of needs.slice(i, i + BATCH_SIZE)) {
      const to = d.data().to;
      if (to) batch.update(d.ref, { deliveredTo: to });
    }
    await batch.commit();
    done += Math.min(BATCH_SIZE, needs.length - i);
    console.log(`진행: ${done}/${needs.length}`);
  }

  console.log("마이그레이션 완료!");
}

migrate().catch(console.error);
