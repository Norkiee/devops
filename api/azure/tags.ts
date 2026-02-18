import { VercelRequest, VercelResponse } from '@vercel/node';
import { getTags } from '../_lib/azure';
import { requireAuth, handleCors, isAzureAuthError } from '../_lib/auth';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = requireAuth(req, res);
  if (!auth) return;

  const projectId = req.query.projectId;
  if (!projectId || typeof projectId !== 'string') {
    res.status(400).json({ error: 'Missing projectId query parameter' });
    return;
  }

  try {
    const tags = await getTags({
      org: auth.org,
      accessToken: auth.accessToken,
      projectId,
    });
    res.status(200).json({ tags });
  } catch (error) {
    console.error('Tags error:', error);
    if (isAzureAuthError(error)) {
      res.status(401).json({ error: 'Session expired. Please reconnect to Azure DevOps.' });
      return;
    }
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
}
