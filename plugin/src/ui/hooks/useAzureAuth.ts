import { useState, useCallback } from 'react';

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

// PAT-based auth, in memory only. The token is NEVER written to figma.clientStorage
// or anywhere on disk — keeping people's long-lived PATs off persistent storage.
// The trade-off is that the user re-enters the PAT each time the plugin reopens
// (the org/project URL is pre-filled from storage, so it's just one paste).
export function useAzureAuth(): UseAzureAuthResult {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const connect = useCallback((pat: string) => {
    setAccessToken(pat);
    setAuthError(null);
  }, []);

  const logout = useCallback(() => {
    setAccessToken(null);
    setAuthError(null);
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
