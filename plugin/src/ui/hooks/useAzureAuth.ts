import { useState, useEffect, useCallback, useRef } from 'react';
import { getAuthUrl, pollAuthResult, refreshToken } from '../services/api';
import { getStorage, setStorage } from '../services/storage';

interface UseAzureAuthResult {
  isAuthenticated: boolean;
  accessToken: string | null;
  sessionId: string | null;
  startAuth: () => void;
  refresh: () => Promise<void>;
  logout: () => void;
}

function generateId(): string {
  return 'xxxxxxxxxxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

export function useAzureAuth(): UseAzureAuthResult {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const pollInterval = useRef<number | null>(null);

  useEffect(() => {
    const stored = getStorage();
    if (stored.accessToken && stored.sessionId) {
      setAccessToken(stored.accessToken);
      setSessionId(stored.sessionId);
    }
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, []);

  const startAuth = useCallback(() => {
    const state = generateId();

    // Open auth URL in browser
    window.open(getAuthUrl(state), '_blank');

    // Poll for completion every 2 seconds
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
    }

    pollInterval.current = window.setInterval(async () => {
      try {
        const result = await pollAuthResult(state);
        if (result) {
          clearInterval(pollInterval.current!);
          pollInterval.current = null;
          setAccessToken(result.accessToken);
          setSessionId(result.sessionId);
          setStorage({
            accessToken: result.accessToken,
            sessionId: result.sessionId,
          });
        }
      } catch {
        // Keep polling on error
      }
    }, 2000);
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
