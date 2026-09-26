import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, TOKEN_KEY } from './api';
import type { Role, SessionUser } from './types';

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => void;
  refresh: () => Promise<void>;
  is: (...roles: Role[]) => boolean;
  /** Admin is unrestricted, so it satisfies every capability check. */
  canManage: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = async () => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<SessionUser>('/auth/me');
      setUser(data);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSession();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      is: (...roles: Role[]) => !!user && (user.role === 'ADMIN' || roles.includes(user.role)),
      // EM runs projects on the same footing as a PM.
      canManage: user?.role === 'ADMIN' || user?.role === 'PM' || user?.role === 'EM',
      login: async (email, password) => {
        const { data } = await api.post<{ accessToken: string; user: SessionUser }>('/auth/login', {
          email,
          password,
        });
        localStorage.setItem(TOKEN_KEY, data.accessToken);
        setUser(data.user);
        return data.user;
      },
      logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      },
      refresh: loadSession,
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
