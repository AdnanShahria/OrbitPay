import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  authFetch,
  clearAuthToken,
  CLIENT_JWT_STORAGE_KEY,
  getAuthToken,
  setAuthToken,
  UNAUTHORIZED_EVENT,
  unwrapApiResponse,
} from '@/shared/utils/api';

export interface AuthUser {
  id: string;
  merchantId: string;
  email: string;
  fullName: string;
  role: string;
}

export interface AuthMerchant {
  id: string;
  storeName: string;
  slug?: string;
  webhookUrl: string;
  gracePeriodMinutes: number;
  isActive: boolean;
}

export interface AuthSession {
  id: string;
  userId?: string;
  deviceType: string;
  deviceName?: string | null;
  expiresAt: string;
  revokedAt?: string | null;
  createdAt?: string;
}

interface LoginResponseData {
  accessToken: string;
  sessionId: string;
  expiresAt: string;
  user: AuthUser;
  merchant: AuthMerchant;
}

interface MeResponseData {
  user: AuthUser;
  session: AuthSession;
  merchant: AuthMerchant;
}

interface AuthContextValue {
  user: AuthUser | null;
  merchant: AuthMerchant | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [merchant, setMerchant] = useState<AuthMerchant | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(getAuthToken()));

  const clearState = useCallback(() => {
    clearAuthToken();
    setUser(null);
    setMerchant(null);
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const refreshSession = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await authFetch('/api/v1/auth/me');
      const data = await unwrapApiResponse<MeResponseData>(res, 'Session expired');
      setUser(data.user);
      setMerchant(data.merchant);
      setSession(data.session);
    } catch {
      clearAuthToken();
      setUser(null);
      setMerchant(null);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setMerchant(null);
      setSession(null);
      queryClient.clear();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== CLIENT_JWT_STORAGE_KEY) return;
      if (!event.newValue) {
        setUser(null);
        setMerchant(null);
        setSession(null);
        queryClient.clear();
      } else if (event.newValue !== event.oldValue) {
        refreshSession();
      }
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
      window.removeEventListener('storage', handleStorage);
    };
  }, [queryClient, refreshSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          deviceType: 'WEB',
        }),
      });

      const data = await unwrapApiResponse<LoginResponseData>(res, 'Invalid email or password');
      queryClient.clear();
      setAuthToken(data.accessToken);
      setUser(data.user);
      setMerchant(data.merchant);
      setSession({
        id: data.sessionId,
        userId: data.user.id,
        deviceType: 'WEB',
        expiresAt: data.expiresAt,
      });
      queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    const token = getAuthToken();
    clearState();
    if (!token) return;

    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      // Best-effort server revocation
    }
  }, [clearState]);

  return (
    <AuthContext.Provider
      value={{
        user,
        merchant,
        session,
        isAuthenticated: Boolean(user && merchant),
        isLoading,
        login,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
