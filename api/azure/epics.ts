import { VercelRequest, VercelResponse } from '@vercel/node';
import { queryEpics } from '../_lib/azure';
import { requireAuth, handleCors, isAzureAuthError } from '../_lib/auth';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (handleCors(req, res)) return;

  const auth = requireAuth(req, res);
  if (!auth) return;

  // GET: Fetch epics
  if (req.method === 'GET') {
    const projectId = req.query.projectId;
    if (!projectId || typeof projectId !== 'string') {
      res.status(400).json({ error: 'Missing projectId query parameter' });
      return;
    }

    try {
      const epics = await queryEpics({
        org: auth.org,
        accessToken: auth.accessToken,
        projectId,
      });
      res.status(200).json({ epics });
    } catch (error) {
      console.error('Epics error:', error);
      if (isAzureAuthError(error)) {
        res.status(401).json({ error: 'Session expired. Please reconnect to Azure DevOps.' });
        return;
      }
      res.status(500).json({ error: 'Failed to fetch epics' });
    }
    return;
  }

  // POST: Create epics
  if (req.method === 'POST') {
    res.status(410).json({ error: 'Epic creation has been removed from this tasklist plugin.' });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
