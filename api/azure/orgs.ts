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
    // Check by name since instanceof may not work after bundling
    if (error instanceof Error && error.name === 'AzureAuthError') {
      res.status(401).json({ error: 'Session expired. Please reconnect to Azure DevOps.' });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to fetch organizations';
    res.status(500).json({ error: message });
  }
}
