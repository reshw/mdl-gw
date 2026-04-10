import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  setDoc,
  deleteDoc,
  Unsubscribe,
} from "firebase/firestore";

export interface Mail {
  id: string;
  to: string;
  cc?: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  date: string;
  read: boolean;
  createdAt: string;
  attachments: { name: string; contentType: string; size: number; r2Key: string }[];
  failed?: boolean;
  failReason?: string;
  trash?: boolean;
  firstReadAt?: string;
  trackIds?: Record<string, string>;
}

export function subscribeMails(
  email: string,
  callback: (mails: Mail[]) => void,
  folder: "inbox" | "sent" = "inbox"
): Unsubscribe {
  // 단일 필드 where만 사용 — 복합 인덱스 불필요, 나머지는 클라이언트 필터
  const q = folder === "sent"
    ? query(collection(db, "mails"), where("from", "==", email))
    : query(collection(db, "mails"), where("to", "==", email));

  return onSnapshot(q, (snapshot) => {
    const mails = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() } as Mail))
      .filter((m) => !m.trash && (folder === "sent" ? (m as any).type === "sent" : (m as any).type !== "sent"))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    callback(mails);
  });
}

export function subscribeInboxUnread(
  email: string,
  callback: (count: number) => void
): Unsubscribe {
  const q = query(collection(db, "mails"), where("to", "==", email));
  return onSnapshot(q, (snapshot) => {
    const count = snapshot.docs
      .map((d) => d.data())
      .filter((m) => !m.trash && m.type !== "sent" && !m.read)
      .length;
    callback(count);
  });
}

export function subscribeTrash(
  email: string,
  callback: (mails: Mail[]) => void
): Unsubscribe {
  let received: Mail[] = [];
  let sent: Mail[] = [];

  function emit() {
    const all = [...received, ...sent]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    callback(all);
  }

  const q1 = query(collection(db, "mails"), where("to", "==", email));
  const q2 = query(collection(db, "mails"), where("from", "==", email));

  const unsub1 = onSnapshot(q1, (snap) => {
    received = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Mail)).filter((m) => !!m.trash);
    emit();
  });
  const unsub2 = onSnapshot(q2, (snap) => {
    sent = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Mail)).filter((m) => !!m.trash && (m as any).type === "sent");
    emit();
  });

  return () => { unsub1(); unsub2(); };
}

export async function moveToTrash(mailId: string) {
  await updateDoc(doc(db, "mails", mailId), { trash: true, read: true });
}

export async function restoreFromTrash(mailId: string) {
  await updateDoc(doc(db, "mails", mailId), { trash: false });
}

export async function permanentDelete(mailId: string) {
  await deleteDoc(doc(db, "mails", mailId));
}

export async function markAsRead(mail: Mail) {
  const update: Record<string, string | boolean> = { read: true };
  if (!mail.firstReadAt) update.firstReadAt = new Date().toISOString();
  await updateDoc(doc(db, "mails", mail.id), update);
}

export async function markAsUnread(mailId: string) {
  // firstReadAt 은 건드리지 않음 — 분쟁 시 최초 열람 시각 보존
  await updateDoc(doc(db, "mails", mailId), { read: false });
}

export interface Draft {
  id: string;
  userEmail: string;
  to: string;
  subject: string;
  html: string;
  updatedAt: string;
}

export function subscribeDrafts(
  userEmail: string,
  callback: (drafts: Draft[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "drafts"),
    where("userEmail", "==", userEmail)
  );
  return onSnapshot(q, (snapshot) => {
    const drafts = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() } as Draft))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    callback(drafts);
  });
}

export async function saveDraft(data: {
  id?: string;
  userEmail: string;
  to: string;
  subject: string;
  html: string;
}): Promise<string> {
  const payload = {
    userEmail: data.userEmail,
    to: data.to,
    subject: data.subject,
    html: data.html,
    updatedAt: new Date().toISOString(),
  };
  if (data.id) {
    await setDoc(doc(db, "drafts", data.id), payload);
    return data.id;
  } else {
    const ref = await addDoc(collection(db, "drafts"), payload);
    return ref.id;
  }
}

export async function deleteDraft(draftId: string) {
  await deleteDoc(doc(db, "drafts", draftId));
}

export interface TrackingStatus {
  recipient: string;
  sentAt: string;
  openedAt: string | null;
}

export async function getTrackingStatus(trackIds: Record<string, string>): Promise<Record<string, TrackingStatus>> {
  const result: Record<string, TrackingStatus> = {};
  await Promise.all(
    Object.entries(trackIds).map(async ([recipient, trackId]) => {
      const snap = await getDoc(doc(db, "tracking", trackId));
      if (snap.exists()) {
        result[recipient] = snap.data() as TrackingStatus;
      }
    })
  );
  return result;
}

export async function saveSentMail(data: {
  to: string;
  cc?: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  attachmentNames: string[];
  failed?: boolean;
  failReason?: string;
  trackIds?: Record<string, string>;
}) {
  await addDoc(collection(db, "mails"), {
    to: data.to,
    ...(data.cc ? { cc: data.cc } : {}),
    from: data.from,
    subject: data.subject,
    text: data.text,
    html: data.html,
    date: new Date().toISOString(),
    read: true,
    type: "sent",
    attachments: data.attachmentNames.map((name) => ({ name })),
    createdAt: new Date().toISOString(),
    ...(data.failed ? { failed: true, failReason: data.failReason ?? "" } : {}),
    ...(data.trackIds ? { trackIds: data.trackIds } : {}),
  });
}
