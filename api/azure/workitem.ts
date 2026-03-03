import { VercelRequest, VercelResponse } from '@vercel/node';
import { getWorkItemDetails } from '../_lib/azure';
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

  const id = req.query.id;
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Missing id query parameter' });
    return;
  }

  const workItemId = parseInt(id, 10);
  if (isNaN(workItemId)) {
    res.status(400).json({ error: 'Invalid work item id' });
    return;
  }

  try {
    const workItem = await getWorkItemDetails({
      org: auth.org,
      accessToken: auth.accessToken,
      workItemId,
    });
    res.status(200).json(workItem);
  } catch (error) {
    console.error('Work item error:', error);
    if (isAzureAuthError(error)) {
      res.status(401).json({ error: 'Session expired. Please reconnect to Azure DevOps.' });
      return;
    }
    res.status(500).json({ error: 'Failed to fetch work item details' });
  }
}
