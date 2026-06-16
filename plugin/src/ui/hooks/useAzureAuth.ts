import { useState, useEffect, useCallback, useRef } from 'react';
import { getAuthUrl, pollAuthResult, refreshToken, logoutSession } from '../services/api';
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

// 128-bit cryptographically-random hex id, used as the single-use OAuth state.
function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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

    // Restore the session id only — access tokens are NOT persisted. Fetch a
    // fresh one into memory via refresh; if the session is dead, clear it.
    const restore = (sid: string): void => {
      if (hasRestoredFromStorage.current) return;
      hasRestoredFromStorage.current = true;
      setSessionId(sid);
      refreshToken(sid)
        .then((tok) => setAccessToken(tok))
        .catch(() => {
          setSessionId(null);
          setStorage({ sessionId: undefined, accessToken: undefined });
        });
    };

    const stored = getStorage();
    if (stored.sessionId) restore(stored.sessionId);

    // Subscribe to storage changes for async load
    const unsubscribe = onStorageChange((data) => {
      if (data.sessionId) restore(data.sessionId);
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
          // Persist only the session id; the access token stays in memory.
          setStorage({ sessionId: result.sessionId, accessToken: undefined });
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
    if (!sessionId) {
      // No session to refresh - throw so caller knows to redirect to connect
      throw new Error('No session to refresh');
    }
    try {
      const newToken = await refreshToken(sessionId);
      setAccessToken(newToken);
    } catch {
      setAccessToken(null);
      setSessionId(null);
      setStorage({ accessToken: undefined, sessionId: undefined });
      throw new Error('Token refresh failed');
    }
  }, [sessionId]);

  const logout = useCallback(() => {
    // Revoke the server-side refresh token (best-effort), then clear locally.
    if (sessionId) {
      void logoutSession(sessionId);
    }
    setAccessToken(null);
    setSessionId(null);
    setAuthError(null);
    setStorage({ accessToken: undefined, sessionId: undefined });
  }, [sessionId]);

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
