import { VercelRequest, VercelResponse } from '@vercel/node';

// Check if an error is an Azure auth error (works after bundling)
export function isAzureAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Set by the AzureAuthError class (the source of truth — processResponse only
  // throws it for real 401/403 responses).
  if (error.name === 'AzureAuthError') return true;
  // Reconstructed errors (e.g. bulk-create result strings) lose the class name,
  // so also match the message prefix AzureAuthError uses. Do NOT match bare
  // "401"/"403" — those collide with Azure error codes like VS403xxx / TF401xxx
  // and would misclassify ordinary 400s (e.g. WIQL errors) as auth failures.
  return error.message.toLowerCase().includes('authentication failed');
}

export function getAccessToken(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

// Azure DevOps org names are alphanumeric with internal hyphens/underscores and
// dots. Reject anything else (slashes, whitespace, control chars) so the value
// can't be used for path/query injection when interpolated into request URLs.
const ORG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export function getOrg(req: VercelRequest): string | null {
  const org = req.query.org;
  if (!org || typeof org !== 'string' || !ORG_PATTERN.test(org)) {
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
