import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";

async function authHeader() {
  const token = await getIdToken(auth.currentUser!);
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export async function getSignature(): Promise<string> {
  const headers = await authHeader();
  const res = await fetch("/api/signature", { headers });
  if (!res.ok) return "";
  const data = await res.json();
  return data.signature ?? "";
}

export async function saveSignature(signature: string): Promise<void> {
  const headers = await authHeader();
  await fetch("/api/signature", {
    method: "POST",
    headers,
    body: JSON.stringify({ signature }),
  });
}
