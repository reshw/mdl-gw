import { getPersonalDb } from "@/lib/personal-db";
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
  CollectionReference,
  DocumentData,
} from "firebase/firestore";

function mailsCollection(email: string): CollectionReference<DocumentData> {
  return collection(getPersonalDb(), "mails");
}

function mailDoc(email: string, mailId: string) {
  return doc(getPersonalDb(), "mails", mailId);
}

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
  attachments: { name: string; contentType?: string; size?: number; r2Key?: string; url?: string }[];
  failed?: boolean;
  failReason?: string;
  trash?: boolean;
  firstReadAt?: string;
  trackIds?: Record<string, string>;
  labels?: string[];
  folder?: string;
}

export function subscribeMails(
  email: string,
  callback: (mails: Mail[]) => void,
  folder: "inbox" | "sent" = "inbox"
): Unsubscribe {
  const q = folder === "sent"
    ? query(mailsCollection(email), where("from", "==", email))
    : query(mailsCollection(email), where("deliveredTo", "==", email));

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
  const q = query(mailsCollection(email), where("deliveredTo", "==", email));
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

  const q1 = query(mailsCollection(email), where("deliveredTo", "==", email));
  const q2 = query(mailsCollection(email), where("from", "==", email));

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

export async function moveToTrash(mailId: string, email: string) {
  await updateDoc(mailDoc(email, mailId), { trash: true, read: true });
}

export async function restoreFromTrash(mailId: string, email: string) {
  await updateDoc(mailDoc(email, mailId), { trash: false });
}

export async function permanentDelete(mailId: string, email: string) {
  await deleteDoc(mailDoc(email, mailId));
}

export async function markAsRead(mail: Mail, email: string) {
  const update: Record<string, string | boolean> = { read: true };
  if (!mail.firstReadAt) update.firstReadAt = new Date().toISOString();
  await updateDoc(mailDoc(email, mail.id), update);
}

export async function markAsUnread(mailId: string, email: string) {
  await updateDoc(mailDoc(email, mailId), { read: false });
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
    collection(getPersonalDb(), "drafts"),
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
    await setDoc(doc(getPersonalDb(), "drafts", data.id), payload);
    return data.id;
  } else {
    const ref = await addDoc(collection(getPersonalDb(), "drafts"), payload);
    return ref.id;
  }
}

export async function deleteDraft(draftId: string) {
  await deleteDoc(doc(getPersonalDb(), "drafts", draftId));
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
      const snap = await getDoc(doc(getPersonalDb(), "tracking", trackId));
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
  await addDoc(collection(getPersonalDb(), "mails"), {
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
