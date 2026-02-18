import { VercelRequest, VercelResponse } from '@vercel/node';

// Check if an error is an Azure auth error (works after bundling)
export function isAzureAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Check error name (set by AzureAuthError class)
  if (error.name === 'AzureAuthError') return true;
  // Also check message for common auth patterns
  const msg = error.message.toLowerCase();
  return (
    msg.includes('authentication failed') ||
    msg.includes('unauthorized') ||
    msg.includes('token expired') ||
    msg.includes('invalid token')
  );
}

export function getAccessToken(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

export function getOrg(req: VercelRequest): string | null {
  const org = req.query.org;
  if (!org || typeof org !== 'string') {
    return null;
  }
  return org;
}

export function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): { accessToken: string; org: string } | null {
  const accessToken = getAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return null;
  }

  const org = getOrg(req);
  if (!org) {
    res.status(400).json({ error: 'Missing org query parameter' });
    return null;
  }

  return { accessToken, org };
}

export function handleCors(
  req: VercelRequest,
  res: VercelResponse
): boolean {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
