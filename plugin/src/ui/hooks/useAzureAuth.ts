import { useState, useEffect, useCallback, useRef } from 'react';
import { initStorage, getStorage, setStorage, onStorageChange } from '../services/storage';

interface UseAzureAuthResult {
  isAuthenticated: boolean;
  // The Azure DevOps personal access token (sent to the backend as the bearer
  // value; the backend forwards it to Azure as HTTP Basic auth).
  accessToken: string | null;
  authError: string | null;
  connect: (pat: string) => void;
  logout: () => void;
  clearAuthError: () => void;
}

// PAT-based auth. The token is stored on the user's device via figma.clientStorage
// (sandboxed to this plugin, never uploaded) so they stay connected across plugin
// restarts. If a stored PAT is later rejected by Azure, the app clears it and
// returns the user to the connect screen.
export function useAzureAuth(): UseAzureAuthResult {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const hasRestored = useRef(false);

  // Restore a stored PAT once clientStorage loads.
  useEffect(() => {
    initStorage();

    const restore = (pat: string): void => {
      if (hasRestored.current) return;
      hasRestored.current = true;
      setAccessToken(pat);
    };

    const stored = getStorage();
    if (stored.pat) restore(stored.pat);

    const unsubscribe = onStorageChange((data) => {
      if (data.pat) restore(data.pat);
    });
    return unsubscribe;
  }, []);

  const connect = useCallback((pat: string) => {
    setAccessToken(pat);
    setAuthError(null);
    setStorage({ pat });
  }, []);

  const logout = useCallback(() => {
    setAccessToken(null);
    setAuthError(null);
    setStorage({ pat: undefined });
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  return {
    isAuthenticated: !!accessToken,
    accessToken,
    authError,
    connect,
    logout,
    clearAuthError,
  };
}
