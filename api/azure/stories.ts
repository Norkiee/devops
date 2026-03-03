import { VercelRequest, VercelResponse } from '@vercel/node';
import { queryStories, queryStoriesByEpic } from '../_lib/azure';
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

  // Optional epicId filter - when provided, only return User Stories under that Epic
  const epicId = req.query.epicId;
  const epicIdNum = epicId && typeof epicId === 'string' ? parseInt(epicId, 10) : undefined;

  try {
    let stories;
    if (epicIdNum && !isNaN(epicIdNum)) {
      // Fetch User Stories under the specified Epic
      stories = await queryStoriesByEpic({
        org: auth.org,
        accessToken: auth.accessToken,
        projectId,
        epicId: epicIdNum,
      });
    } else {
      // Fetch all work items (Epics, Features, User Stories) - existing behavior
      stories = await queryStories({
        org: auth.org,
        accessToken: auth.accessToken,
        projectId,
      });
    }
    res.status(200).json({ stories });
  } catch (error) {
    console.error('Stories error:', error);
    if (isAzureAuthError(error)) {
      res.status(401).json({ error: 'Session expired. Please reconnect to Azure DevOps.' });
      return;
    }
    res.status(500).json({ error: 'Failed to fetch stories' });
  }
}
