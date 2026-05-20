"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { setPersonalDb } from "@/lib/personal-db";
import { initializeApp, getApps, deleteApp, FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const USE_SMTP = process.env.NEXT_PUBLIC_MAIL_TRANSPORT === "smtp";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  mailEmail: string | null;
  isAdmin: boolean;
  dbReady: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  mailEmail: null,
  isAdmin: false,
  dbReady: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mailEmail, setMailEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dbReady, setDbReady] = useState(!USE_SMTP);

  useEffect(() => {
    let personalApp: FirebaseApp | null = null;

    return onAuthStateChanged(auth, async (u) => {
      setUser(u);

      // 구독 먼저 끊고 나서 앱 삭제
      if (USE_SMTP) setDbReady(false);
      if (personalApp) {
        await deleteApp(personalApp);
        personalApp = null;
        setPersonalDb(null);
      }

      if (u) {
        const result = await u.getIdTokenResult();
        const mail = (result.claims.mailEmail as string) ?? u.email ?? "";
        setMailEmail(mail);
        setIsAdmin(result.claims.isAdmin === true);

        if (USE_SMTP && mail) {
          try {
            const token = await u.getIdToken();
            const res = await fetch("/api/tenant-firebase", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const config = await res.json();
              const appName = `personal-${mail}`;
              const existing = getApps().find((a) => a.name === appName);
              personalApp = existing ?? initializeApp(config, appName);
              setPersonalDb(getFirestore(personalApp));
            }
          } catch (e) {
            console.error("Failed to init personal Firebase:", e);
          }
          setDbReady(true);
        }
      } else {
        setMailEmail(null);
        setIsAdmin(false);
        setDbReady(!USE_SMTP);
      }
      setLoading(false);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, mailEmail, isAdmin, dbReady }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
