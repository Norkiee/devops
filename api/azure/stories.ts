import { VercelRequest, VercelResponse } from '@vercel/node';
import { queryStories, queryStoriesByEpic, queryStoriesByFeature } from '../_lib/azure';
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

  // GET: Fetch stories
  if (req.method === 'GET') {
    const projectId = req.query.projectId;
    if (!projectId || typeof projectId !== 'string') {
      res.status(400).json({ error: 'Missing projectId query parameter' });
      return;
    }

    const epicId = req.query.epicId;
    const epicIdNum = epicId && typeof epicId === 'string' ? parsePositiveInt(epicId) : undefined;
    if (epicId && typeof epicId === 'string' && epicIdNum === null) {
      res.status(400).json({ error: 'epicId must be a positive integer' });
      return;
    }

    const featureId = req.query.featureId;
    const featureIdNum = featureId && typeof featureId === 'string' ? parsePositiveInt(featureId) : undefined;
    if (featureId && typeof featureId === 'string' && featureIdNum === null) {
      res.status(400).json({ error: 'featureId must be a positive integer' });
      return;
    }

    try {
      // Narrowest filter wins: a feature, else an epic, else all project stories.
      let stories;
      if (featureIdNum) {
        stories = await queryStoriesByFeature({
          org: auth.org,
          accessToken: auth.accessToken,
          projectId,
          featureId: featureIdNum,
        });
      } else if (epicIdNum) {
        stories = await queryStoriesByEpic({
          org: auth.org,
          accessToken: auth.accessToken,
          projectId,
          epicId: epicIdNum,
        });
      } else {
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
    return;
  }

  // POST: Create user stories
  if (req.method === 'POST') {
    res.status(410).json({ error: 'Story creation has been removed from this tasklist plugin.' });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
