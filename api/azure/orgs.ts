import { VercelRequest, VercelResponse } from '@vercel/node';
import { listOrganizations, AzureAuthError } from '../_lib/azure';
import { getAccessToken, handleCors } from '../_lib/auth';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const accessToken = getAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    const orgs = await listOrganizations(accessToken);
    res.status(200).json({ orgs });
  } catch (error) {
    console.error('Orgs error:', error);
    // Forward auth errors as 401 so the client can handle session expiration
    if (error instanceof AzureAuthError) {
      res.status(401).json({ error: 'Session expired. Please reconnect to Azure DevOps.' });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to fetch organizations';
    res.status(500).json({ error: message });
  }
}
