import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot,
  addDoc, deleteDoc, doc, updateDoc, arrayUnion, arrayRemove,
  type Unsubscribe,
} from "firebase/firestore";

export const LABEL_COLORS: { value: string; dot: string; pill: string }[] = [
  { value: "red",    dot: "bg-red-500",    pill: "bg-red-100 text-red-700 border-red-200" },
  { value: "orange", dot: "bg-orange-500", pill: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "yellow", dot: "bg-yellow-400", pill: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "green",  dot: "bg-green-500",  pill: "bg-green-100 text-green-700 border-green-200" },
  { value: "blue",   dot: "bg-blue-500",   pill: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "purple", dot: "bg-purple-500", pill: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "zinc",   dot: "bg-zinc-400",   pill: "bg-zinc-100 text-zinc-600 border-zinc-200" },
];

/** color가 "#rrggbb" 형태면 인라인 스타일, 아니면 Tailwind 클래스 반환 */
export function resolveLabelColor(color: string) {
  if (color.startsWith("#")) {
    return {
      dotClass: "",
      dotStyle: { backgroundColor: color },
      pillClass: "border",
      pillStyle: { color, backgroundColor: color + "22", borderColor: color + "55" },
    };
  }
  const c = LABEL_COLORS.find((x) => x.value === color) ?? LABEL_COLORS[6];
  return { dotClass: c.dot, dotStyle: undefined, pillClass: c.pill, pillStyle: undefined };
}

export interface Label {
  id: string;
  userEmail: string;
  name: string;
  color: string;
}

export function subscribeLabels(userEmail: string, callback: (labels: Label[]) => void): Unsubscribe {
  const q = query(collection(db, "labels"), where("userEmail", "==", userEmail));
  return onSnapshot(q, (snap) => {
    const labels = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Label))
      .sort((a, b) => a.name.localeCompare(b.name));
    callback(labels);
  });
}

export async function createLabel(userEmail: string, name: string, color: string): Promise<void> {
  await addDoc(collection(db, "labels"), { userEmail, name, color });
}

export async function updateLabel(labelId: string, name: string, color: string): Promise<void> {
  await updateDoc(doc(db, "labels", labelId), { name, color });
}

export async function deleteLabel(labelId: string): Promise<void> {
  await deleteDoc(doc(db, "labels", labelId));
}

export async function addLabelToMail(mailId: string, labelId: string): Promise<void> {
  await updateDoc(doc(db, "mails", mailId), { labels: arrayUnion(labelId) });
}

export async function removeLabelFromMail(mailId: string, labelId: string): Promise<void> {
  await updateDoc(doc(db, "mails", mailId), { labels: arrayRemove(labelId) });
}
