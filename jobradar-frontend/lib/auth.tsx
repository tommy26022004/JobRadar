"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type User = { id: number; email: string; full_name: string; is_verified?: boolean };
type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { setLoading(false); return; }
    api.auth.me().then(setUser).catch(() => localStorage.removeItem("access_token")).finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { access_token, refresh_token } = await api.auth.login(email, password);
    localStorage.setItem("access_token", access_token);
    localStorage.setItem("refresh_token", refresh_token);
    const me = await api.auth.me();
    setUser(me);
    router.push("/dashboard");
  };

  const register = async (email: string, password: string, name: string) => {
    const { access_token, refresh_token } = await api.auth.register(email, password, name);
    localStorage.setItem("access_token", access_token);
    localStorage.setItem("refresh_token", refresh_token);
    const me = await api.auth.me();
    setUser(me);
    // Only go to dashboard if auto-verified (no Resend key in dev)
    if (me.is_verified !== false) {
      router.push("/dashboard");
    }
    // Otherwise register page will show "check your email" UI
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
    router.push("/login");
  };

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
