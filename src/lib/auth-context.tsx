"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  mailEmail: string | null;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  mailEmail: null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mailEmail, setMailEmail] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const result = await u.getIdTokenResult();
        setMailEmail((result.claims.mailEmail as string) ?? u.email);
      } else {
        setMailEmail(null);
      }
      setLoading(false);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, mailEmail }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
