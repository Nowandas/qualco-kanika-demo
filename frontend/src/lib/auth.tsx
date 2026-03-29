import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { api, clearLegacyBearerToken, setLegacyBearerToken } from "@/api/client";
import type { User } from "@/api/types";

interface AcceptInvitationPayload {
  token: string;
  full_name: string;
  password: string;
  avatar_seed?: string | null;
  avatar_style?: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  acceptInvitation: (payload: AcceptInvitationPayload) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const response = await api.get<User>("/auth/me");
      setUser(response.data);
      return true;
    } catch {
      setUser(null);
      return false;
    }
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.post<{ access_token?: string }>("/auth/login", { email, password });
    const authenticated = await refresh();
    if (!authenticated && response.data.access_token) {
      setLegacyBearerToken(response.data.access_token);
      await refresh();
    } else {
      clearLegacyBearerToken();
    }
  };

  const acceptInvitation = async (payload: AcceptInvitationPayload) => {
    const response = await api.post<{ access_token?: string }>("/auth/accept-invitation", payload);
    const authenticated = await refresh();
    if (!authenticated && response.data.access_token) {
      setLegacyBearerToken(response.data.access_token);
      await refresh();
    } else {
      clearLegacyBearerToken();
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      clearLegacyBearerToken();
      setUser(null);
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      acceptInvitation,
      logout,
      refresh,
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
