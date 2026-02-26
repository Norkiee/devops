import { useState, useEffect, useCallback, useRef } from 'react';
import { getAuthUrl, pollAuthResult, refreshToken } from '../services/api';
import { initStorage, getStorage, setStorage, onStorageChange } from '../services/storage';

interface UseAzureAuthResult {
  isAuthenticated: boolean;
  accessToken: string | null;
  sessionId: string | null;
  authError: string | null;
  startAuth: (onComplete?: () => void) => void;
  refresh: () => Promise<void>;
  logout: () => void;
  clearAuthError: () => void;
}

function generateId(): string {
  return 'xxxxxxxxxxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

export function useAzureAuth(): UseAzureAuthResult {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const pollInterval = useRef<number | null>(null);
  const pollTimeout = useRef<number | null>(null);
  const hasRestoredFromStorage = useRef(false);

  const AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  // Restore auth from storage when it loads
  useEffect(() => {
    // Initialize storage to ensure it's loaded
    initStorage();

    // Check immediately in case storage is already loaded
    const stored = getStorage();
    if (stored.accessToken && stored.sessionId && !hasRestoredFromStorage.current) {
      hasRestoredFromStorage.current = true;
      setAccessToken(stored.accessToken);
      setSessionId(stored.sessionId);
    }

    // Subscribe to storage changes for async load
    const unsubscribe = onStorageChange((data) => {
      if (data.accessToken && data.sessionId && !hasRestoredFromStorage.current) {
        hasRestoredFromStorage.current = true;
        setAccessToken(data.accessToken);
        setSessionId(data.sessionId);
      }
    });

    return unsubscribe;
  }, []);

  // Cleanup polling and timeout on unmount
  useEffect(() => {
    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
      if (pollTimeout.current) {
        clearTimeout(pollTimeout.current);
      }
    };
  }, []);

  const startAuth = useCallback((onComplete?: () => void) => {
    const state = generateId();
    setAuthError(null);

    // Open auth URL in browser
    window.open(getAuthUrl(state), '_blank');

    // Clear any existing polling/timeout
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
    }
    if (pollTimeout.current) {
      clearTimeout(pollTimeout.current);
    }

    // Set timeout to stop polling after 5 minutes
    pollTimeout.current = window.setTimeout(() => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
        pollInterval.current = null;
      }
      setAuthError('Authentication timed out. Please try again.');
    }, AUTH_TIMEOUT_MS);

    // Poll for completion every 2 seconds
    pollInterval.current = window.setInterval(async () => {
      try {
        const result = await pollAuthResult(state);
        if (result) {
          // Clear both interval and timeout on success
          clearInterval(pollInterval.current!);
          pollInterval.current = null;
          if (pollTimeout.current) {
            clearTimeout(pollTimeout.current);
            pollTimeout.current = null;
          }
          setAccessToken(result.accessToken);
          setSessionId(result.sessionId);
          setStorage({
            accessToken: result.accessToken,
            sessionId: result.sessionId,
          });
          // Call completion callback after a short delay to ensure state has propagated
          if (onComplete) {
            setTimeout(onComplete, 100);
          }
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
    setAuthError(null);
    setStorage({ accessToken: undefined, sessionId: undefined });
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  return {
    isAuthenticated: !!accessToken,
    accessToken,
    sessionId,
    authError,
    startAuth,
    refresh,
    logout,
    clearAuthError,
  };
}
