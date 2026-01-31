import { useState, useEffect, useCallback } from 'react';
import { getAuthUrl, refreshToken } from '../services/api';
import { getStorage, setStorage } from '../services/storage';

interface UseAzureAuthResult {
  isAuthenticated: boolean;
  accessToken: string | null;
  sessionId: string | null;
  startAuth: () => void;
  refresh: () => Promise<void>;
  logout: () => void;
}

export function useAzureAuth(): UseAzureAuthResult {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const stored = getStorage();
    if (stored.accessToken && stored.sessionId) {
      setAccessToken(stored.accessToken);
      setSessionId(stored.sessionId);
    }
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent): void => {
      const data = event.data;
      if (data?.type === 'azure-auth-success') {
        setAccessToken(data.accessToken);
        setSessionId(data.sessionId);
        setStorage({
          accessToken: data.accessToken,
          sessionId: data.sessionId,
        });
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const startAuth = useCallback(() => {
    window.open(getAuthUrl(), '_blank');
  }, []);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const newToken = await refreshToken(sessionId);
      setAccessToken(newToken);
      setStorage({ accessToken: newToken });
    } catch {
      setAccessToken(null);
      setSessionId(null);
      setStorage({ accessToken: undefined, sessionId: undefined });
    }
  }, [sessionId]);

  const logout = useCallback(() => {
    setAccessToken(null);
    setSessionId(null);
    setStorage({ accessToken: undefined, sessionId: undefined });
  }, []);

  return {
    isAuthenticated: !!accessToken,
    accessToken,
    sessionId,
    startAuth,
    refresh,
    logout,
  };
}
