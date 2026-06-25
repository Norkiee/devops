import { VercelRequest, VercelResponse } from '@vercel/node';
import { queryFeatures, queryFeaturesByEpic } from '../_lib/azure';
import { requireAuth, handleCors, isAzureAuthError } from '../_lib/auth';

function parsePositiveInt(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (handleCors(req, res)) return;

  const auth = requireAuth(req, res);
  if (!auth) return;

  // GET: Fetch features
  if (req.method === 'GET') {
    const projectId = req.query.projectId;
    if (!projectId || typeof projectId !== 'string') {
      res.status(400).json({ error: 'Missing projectId query parameter' });
      return;
    }

    const epicId = req.query.epicId;

    try {
      let features;
      if (epicId && typeof epicId === 'string') {
        const epicIdNum = parsePositiveInt(epicId);
        if (epicIdNum === null) {
          res.status(400).json({ error: 'epicId must be a positive integer' });
          return;
        }
        features = await queryFeaturesByEpic({
          org: auth.org,
          accessToken: auth.accessToken,
          projectId,
          epicId: epicIdNum,
        });
      } else {
        features = await queryFeatures({
          org: auth.org,
          accessToken: auth.accessToken,
          projectId,
        });
      }
      res.status(200).json({ features });
    } catch (error) {
      console.error('Features error:', error);
      if (isAzureAuthError(error)) {
        res.status(401).json({ error: 'Session expired. Please reconnect to Azure DevOps.' });
        return;
      }
      res.status(500).json({ error: 'Failed to fetch features' });
    }
    return;
  }

  // POST: Create features
  if (req.method === 'POST') {
    res.status(410).json({ error: 'Feature creation has been removed from this tasklist plugin.' });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
