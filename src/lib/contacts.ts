import { db, auth } from "@/lib/firebase";
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs } from "firebase/firestore";

export interface Contact {
  id: string;
  name: string;
  email: string;
}

export async function getPersonalContacts(): Promise<Contact[]> {
  const userEmail = auth.currentUser?.email;
  if (!userEmail) return [];
  const snap = await getDocs(collection(db, "contacts", userEmail, "personal"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contact));
}

export async function addPersonalContact(name: string, email: string): Promise<string> {
  const userEmail = auth.currentUser!.email!;
  const ref = await addDoc(collection(db, "contacts", userEmail, "personal"), { name, email });
  return ref.id;
}

export async function updatePersonalContact(id: string, name: string, email: string): Promise<void> {
  const userEmail = auth.currentUser!.email!;
  await updateDoc(doc(db, "contacts", userEmail, "personal", id), { name, email });
}

export async function deletePersonalContact(id: string): Promise<void> {
  const userEmail = auth.currentUser!.email!;
  await deleteDoc(doc(db, "contacts", userEmail, "personal", id));
}

export async function getGlobalContacts(): Promise<Contact[]> {
  const snap = await getDocs(collection(db, "contacts", "global", "entries"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contact));
}

export async function addGlobalContact(name: string, email: string): Promise<string> {
  const ref = await addDoc(collection(db, "contacts", "global", "entries"), { name, email });
  return ref.id;
}

export async function updateGlobalContact(id: string, name: string, email: string): Promise<void> {
  await updateDoc(doc(db, "contacts", "global", "entries", id), { name, email });
}

export async function deleteGlobalContact(id: string): Promise<void> {
  await deleteDoc(doc(db, "contacts", "global", "entries", id));
}
