import { getPersonalDb } from "@/lib/personal-db";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  setDoc,
  deleteDoc,
  orderBy,
  limit,
  startAfter,
  Unsubscribe,
  CollectionReference,
  DocumentData,
  QueryConstraint,
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
  /** 발신자 본인의 보낸편지함 기록에만 존재. 수신 메일에는 원문상 남지 않는다. */
  bcc?: string;
  /** 수신 메일의 Reply-To. 있으면 답장 수신자는 from이 아니라 이 주소다. */
  replyTo?: string;
  /** Cloudflare Email Routing이 기록한 SPF/DKIM/DMARC 검증 결과 원문. */
  authResults?: string;
  from: string;
  subject: string;
  /** 본문. 목록/검색은 text만, 뷰어는 html을 쓴다 — 아래 BODY MIGRATION 주석 참고. */
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
  /** 열람 추적 id — 메일당 하나. 수신자 구분은 픽셀 URL의 주소로 한다. */
  trackId?: string;
  /** 옛 방식(수신자별 id 맵). 과거에 보낸 메일에만 남아 있다 — [[getTrackingStatus]] 참고. */
  trackIds?: Record<string, string>;
  labels?: string[];
  folder?: string;
  type?: "sent";
  /** 같은 테넌트 내부 발송 시 수신자 몫으로 직접 써지는 문서에 붙는다(from은 여전히 발신자).
   *  발신자 세션에서 "내 sent 문서"와 구분하는 유일한 표식이다. */
  deliveredTo?: string;
  /** 같은 Message-ID가 여러 계정에 동시에 오는 사내 공지메일 등, 한 문서를 여러 명이 공유할 때
   *  받는 사람 전원이 여기 쌓인다(deliveredTo는 최초 아카이빙한 계정만 기록). */
  deliveredToList?: string[];
}

export interface MailListOpts {
  folder: "inbox" | "sent";
  imapFolder?: string | null;
  labelId?: string | null;
}

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

/*
 * BODY MIGRATION — 본문(text/html)을 서브컬렉션으로 분리할 때 손댈 곳
 *
 * 지금은 mails 문서 하나에 본문까지 들어있어서, 전체 구독이 본문까지 통째로 끌어온다.
 * 나중에 본문을 mails/{id}/body 같은 서브컬렉션으로 빼면 바꿀 지점은 셋뿐이다.
 *
 *  1. subscribeAllMails — 본문 없는 목록 문서만 받게 된다. 여기 타입을 좁히면
 *     컴파일러가 본문을 쓰는 곳을 전부 짚어준다.
 *  2. 뷰어/전달/EML 다운로드 — 메일을 열 때 본문을 따로 한 건 조회해야 한다.
 *     본문 접근은 이미 이 세 곳에만 몰려 있으므로 목록 코드는 건드릴 필요가 없다.
 *  3. 목록 미리보기와 내용검색 — 지금 text에 의존한다. 본문이 빠지면 부모 문서에
 *     짧은 preview 필드가 있어야 하고, 내용검색은 별도 색인이 필요해진다.
 *     (그래서 본문 분리는 검색 방식 결정과 같이 가야 한다.)
 */

// 이 앱이 보는 메일 전체를 한 번만 구독한다. 받은편지함/보낸편지함/휴지통/안읽음 뱃지/
// IMAP 폴더 목록/검색이 전부 이 결과에서 파생되므로, 예전처럼 같은 컬렉션을 5번 읽지 않는다.
// deliveredTo/deliveredToList/from은 서로 다른 필드라 한 쿼리로 못 묶으므로 리스너 세 개를 머지한다.
export function subscribeAllMails(
  email: string,
  callback: (mails: Mail[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  let received: Mail[] | null = null;
  let receivedList: Mail[] | null = null;
  let sent: Mail[] | null = null;

  function emit() {
    // 세 스냅샷이 다 와야 목록이 완전해진다
    if (received === null || receivedList === null || sent === null) return;
    const byId = new Map<string, Mail>();
    for (const m of [...received, ...receivedList, ...sent]) byId.set(m.id, m);
    callback([...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  const toMails = (snap: { docs: { id: string; data: () => DocumentData }[] }) =>
    snap.docs.map((d) => ({ id: d.id, ...d.data() } as Mail));

  // 한쪽이 실패하면 emit 조건이 영영 안 채워져 목록이 "불러오는 중"에서 멈춘다.
  // 조용히 매달려 있지 말고 실패를 그대로 위로 올린다.
  const fail = (e: unknown) => onError(e instanceof Error ? e.message : String(e));

  const unsub1 = onSnapshot(
    query(mailsCollection(email), where("deliveredTo", "==", email)),
    (snap) => { received = toMails(snap); emit(); },
    fail
  );
  // 같은 Message-ID로 여러 계정에 동시에 오는 사내 공지메일 등, 한 문서를 여러 명이 공유하는
  // 경우 deliveredToList 배열에 전원이 쌓인다 — 최초 아카이빙한 계정만 기록되는 deliveredTo
  // 하나만 봐서는 나머지 수신자 받은편지함에서 안 보인다.
  const unsub1b = onSnapshot(
    query(mailsCollection(email), where("deliveredToList", "array-contains", email)),
    (snap) => { receivedList = toMails(snap); emit(); },
    fail
  );
  const unsub2 = onSnapshot(
    query(mailsCollection(email), where("from", "==", email)),
    (snap) => {
      // from만으로는 부족하다 — 내부 발송 시 상대방 받은편지함용으로 직접 써지는 문서도
      // from이 나라서 같이 걸려온다. deliveredTo가 남이면 그건 내 게 아니라 상대방 것이다.
      sent = toMails(snap).filter((m) => !m.deliveredTo || m.deliveredTo === email);
      emit();
    },
    fail
  );

  return () => { unsub1(); unsub1b(); unsub2(); };
}

// 아래 select*/count* 는 전부 subscribeAllMails 결과를 받는 순수 함수다 — Firestore를 다시 읽지 않는다.

export function selectMails(all: Mail[], opts: MailListOpts): Mail[] {
  return all.filter((m) => {
    if (m.trash) return false;
    if (opts.folder === "sent" ? m.type !== "sent" : m.type === "sent") return false;
    if (opts.imapFolder && m.folder !== opts.imapFolder) return false;
    if (opts.labelId && !m.labels?.includes(opts.labelId)) return false;
    return true;
  });
}

export function selectTrash(all: Mail[]): Mail[] {
  return all.filter((m) => m.trash);
}

export function countInboxUnread(all: Mail[]): number {
  return all.filter((m) => !m.trash && m.type !== "sent" && !m.read).length;
}

export function listImapFolders(all: Mail[]): string[] {
  const folders = new Set<string>();
  for (const m of all) {
    if (m.type === "sent") continue;
    if (m.folder && m.folder !== "INBOX") folders.add(m.folder);
  }
  return [...folders].sort();
}

export interface AdvancedSearchOpts {
  from?: string;
  to?: string;
  toScope?: "to" | "cc" | "to_cc";
  subject?: string;
  contentScope?: "subject" | "subject_content";
  hasAttachment?: "all" | "yes" | "no";
  dateFrom?: string;
  dateTo?: string;
  includeSubfolders?: boolean;
}

// 상세검색 — Firestore는 부분일치 검색을 못 하므로 이미 구독해둔 전체 목록에서 걸러낸다.
// 하위 폴더 포함 시 imapFolder 조건을 뺀다.
export function searchMailsAdvanced(
  all: Mail[],
  baseOpts: MailListOpts,
  adv: AdvancedSearchOpts
): Mail[] {
  const opts: MailListOpts = adv.includeSubfolders
    ? { ...baseOpts, imapFolder: null }
    : baseOpts;
  const scoped = selectMails(all, opts);

  const from = adv.from?.trim().toLowerCase();
  const to = adv.to?.trim().toLowerCase();
  const subject = adv.subject?.trim().toLowerCase();
  const dateFrom = adv.dateFrom ? new Date(adv.dateFrom).getTime() : null;
  // 종료일은 그 날짜의 끝(23:59:59.999)까지 포함해야 "8/7까지"가 8/7 메일을 놓치지 않는다.
  const dateTo = adv.dateTo ? new Date(adv.dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null;

  return scoped.filter((m) => {
    if (from && !m.from.toLowerCase().includes(from)) return false;
    if (to) {
      const scope = adv.toScope ?? "to_cc";
      const targets: string[] = [];
      if (scope === "to" || scope === "to_cc") targets.push(m.to ?? "");
      if (scope === "cc" || scope === "to_cc") targets.push(m.cc ?? "");
      if (!targets.some((t) => t.toLowerCase().includes(to))) return false;
    }
    if (subject) {
      const scope = adv.contentScope ?? "subject";
      const haystack = scope === "subject_content" ? `${m.subject} ${m.text ?? ""}` : m.subject;
      if (!haystack.toLowerCase().includes(subject)) return false;
    }
    if (adv.hasAttachment === "yes" && !m.attachments?.length) return false;
    if (adv.hasAttachment === "no" && m.attachments?.length) return false;
    if (dateFrom !== null || dateTo !== null) {
      const t = new Date(m.date || m.createdAt).getTime();
      if (dateFrom !== null && t < dateFrom) return false;
      if (dateTo !== null && t > dateTo) return false;
    }
    return true;
  });
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
  cc?: string;
  bcc?: string;
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
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
}): Promise<string> {
  const payload = {
    userEmail: data.userEmail,
    to: data.to,
    // 참조/숨은참조도 함께 보관해야 전체답장을 임시저장했다 열었을 때 수신자가 유실되지 않는다.
    cc: data.cc ?? "",
    bcc: data.bcc ?? "",
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
  openedAt: string | null;
}

/** 이 메일이 수신자별 열람 추적을 갖고 있는지. 없으면 화면에 확인 표시를 띄우지 않는다. */
export function isTrackable(mail: Mail, recipient: string): boolean {
  // 새 방식은 메일당 id 하나로 전원(참조 포함)을 추적한다.
  if (mail.trackId) return true;
  // 옛 방식은 발송 시 등록해 둔 수신자만 추적된다 — 외부 참조자는 등록 자체가 없었다.
  return !!mail.trackIds?.[recipient];
}

// 반환값은 "연 사람"만 담는다. 열지 않은 수신자는 키가 없다.
export async function getTrackingStatus(mail: Mail): Promise<Record<string, TrackingStatus>> {
  const result: Record<string, TrackingStatus> = {};

  // 새 방식: 메일당 문서 하나에 수신자별 열람이 누적돼 있어 한 번만 읽으면 된다.
  if (mail.trackId) {
    const snap = await getDoc(doc(getPersonalDb(), "tracking", mail.trackId));
    const opens = (snap.data()?.opens ?? {}) as Record<string, { openedAt?: string }>;
    for (const [recipient, open] of Object.entries(opens)) {
      if (open?.openedAt) result[recipient] = { openedAt: open.openedAt };
    }
    return result;
  }

  // 옛 방식: 수신자마다 문서가 따로 있어 사람 수만큼 읽어야 한다. 과거 메일 전용 경로다.
  await Promise.all(
    Object.entries(mail.trackIds ?? {}).map(async ([recipient, trackId]) => {
      const snap = await getDoc(doc(getPersonalDb(), "tracking", trackId));
      const openedAt = snap.data()?.openedAt;
      if (openedAt) result[recipient] = { openedAt };
    })
  );
  return result;
}

export async function saveSentMail(data: {
  to: string;
  cc?: string;
  bcc?: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  attachmentNames: string[];
  failed?: boolean;
  failReason?: string;
  trackId?: string;
}) {
  await addDoc(collection(getPersonalDb(), "mails"), {
    to: data.to,
    ...(data.cc ? { cc: data.cc } : {}),
    ...(data.bcc ? { bcc: data.bcc } : {}),
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
    ...(data.trackId ? { trackId: data.trackId } : {}),
  });
}
