import { VercelRequest, VercelResponse } from '@vercel/node';
import { queryFeatures, queryFeaturesByEpic } from '../_lib/azure';
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

  const epicId = req.query.epicId;

  try {
    let features;
    if (epicId && typeof epicId === 'string') {
      // Get features under a specific epic
      features = await queryFeaturesByEpic({
        org: auth.org,
        accessToken: auth.accessToken,
        projectId,
        epicId: parseInt(epicId, 10),
      });
    } else {
      // Get all features
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
}
