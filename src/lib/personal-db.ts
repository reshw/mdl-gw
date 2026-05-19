import { db } from "@/lib/firebase";
import { Firestore } from "firebase/firestore";

let _personalDb: Firestore | null = null;

export function setPersonalDb(firestoreDb: Firestore | null) {
  _personalDb = firestoreDb;
}

export function getPersonalDb(): Firestore {
  return _personalDb ?? db;
}
