import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // { user_id, email, role, ... }
  const [loading, setLoading] = useState(true); // initial /me probe
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get("/auth/me");
      setUser(r.data);
      return r.data;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    // CRITICAL: If returning from Google OAuth, skip /me — AuthCallback handles it.
    if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    const r = await api.post("/auth/login", { email, password });
    setUser(r.data.user);
    return r.data.user;
  };

  const register = async (email, password, name) => {
    const r = await api.post("/auth/register", { email, password, name });
    setUser(r.data.user);
    return r.data.user;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    setUser(null);
  };

  const hasPerm = (key) => {
    if (!user) return false;
    if (user.is_superadmin) return true;
    const perms = user.role?.permissions || {};
    return !!perms[key];
  };

  return (
    <AuthCtx.Provider value={{ user, loading, checked, refresh, login, register, logout, hasPerm, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
