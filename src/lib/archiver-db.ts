import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getArchiverDb() {
  const existing = getApps().find((a) => a.name === "archiver");
  if (existing) return getFirestore(existing);

  const serviceAccount = process.env.ARCHIVER_FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) return null;

  const app = initializeApp({ credential: cert(JSON.parse(serviceAccount)) }, "archiver");
  return getFirestore(app);
}

export const archiverDb = getArchiverDb();
