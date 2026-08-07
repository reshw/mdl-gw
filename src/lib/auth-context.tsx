"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User, getAuth } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
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
        let result = await u.getIdTokenResult();
        if (!result.claims.mailEmail && USE_SMTP) {
          result = await u.getIdTokenResult(true);
        }
        const mail = (result.claims.mailEmail as string) ?? u.email ?? "";
        setMailEmail(mail);

        if (USE_SMTP && mail) {
          try {
            const token = await u.getIdToken();
            // isAdmin 확인과 테넌트 Firebase 설정 조회는 서로 무관하니 병렬로 — 순차로 하면
            // 로그인할 때마다 왕복이 두 번 더 걸려서 메일함이 뜨는 게 눈에 띄게 느려진다.
            const [isAdminResult, tenantConfig] = await Promise.all([
              result.claims.isAdmin === true
                ? Promise.resolve(true)
                : fetch("/api/auth/check-admin", { headers: { Authorization: `Bearer ${token}` } })
                    .then((r) => (r.ok ? r.json() : { isAdmin: false }))
                    .then((d) => d.isAdmin === true)
                    .catch(() => false),
              fetch("/api/tenant-firebase", { headers: { Authorization: `Bearer ${token}` } })
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null),
            ]);
            setIsAdmin(isAdminResult);
            if (tenantConfig) {
              if (tenantConfig.projectId === process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
                setPersonalDb(db);
              } else {
                const appName = `personal-${mail}`;
                const existing = getApps().find((a) => a.name === appName);
                personalApp = existing ?? initializeApp(tenantConfig, appName);
                setPersonalDb(getFirestore(personalApp));
              }
            }
          } catch (e) {
            console.error("Failed to init personal Firebase:", e);
          }
          setDbReady(true);
        } else {
          setIsAdmin(result.claims.isAdmin === true);
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
