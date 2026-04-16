import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createRequire } from "module";
import { readFileSync } from "fs";

// 인자로 env 파일 지정 가능: node migrate-firebase-emails.mjs .env.ourim
const envFile = process.argv[2] ?? ".env.local";
const env = Object.fromEntries(
  readFileSync(`D:/dev/mailer/${envFile}`, "utf-8")
    .split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n").replace(/^"|"$/g, ""),
  }),
});

const auth = getAuth();
const db = getFirestore();
const MAIL_DOMAIN = env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr";

const snap = await db.collection("members").get();

for (const doc of snap.docs) {
  const { email, personalEmail } = doc.data();
  if (!personalEmail) {
    console.log(`SKIP ${email} — personalEmail 없음`);
    continue;
  }
  try {
    const user = await auth.getUserByEmail(email);
    if (!user.email.endsWith(`@${MAIL_DOMAIN}`)) {
      console.log(`SKIP ${email} — 이미 마이그레이션됨 (${user.email})`);
      continue;
    }
    await auth.updateUser(user.uid, { email: personalEmail });
    console.log(`OK   ${email} → ${personalEmail}`);
  } catch (e) {
    console.log(`ERR  ${email} — ${e.message}`);
  }
}
