import { VercelRequest, VercelResponse } from '@vercel/node';
import { getWorkItemDetails, getExistingWorkItems } from '../_lib/azure';
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

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = requireAuth(req, res);
  if (!auth) return;

  // Batch existence + state check: `?ids=1,2,3&projectId=...` returns which of
  // those work items still exist, each with its state and a closed flag. Folded
  // into this endpoint (rather than a new function) to stay under the Hobby
  // 12-function cap. Used by the plugin to forget deleted Tasks and to offer
  // closing open ones.
  const idsParam = req.query.ids;
  if (typeof idsParam === 'string' && idsParam.length > 0) {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
    if (!projectId) {
      res.status(400).json({ error: 'Missing projectId query parameter' });
      return;
    }
    const ids = idsParam.split(',').map(parsePositiveInt);
    if (ids.some((n) => n === null)) {
      res.status(400).json({ error: 'ids must be comma-separated positive integers' });
      return;
    }
    try {
      const existing = await getExistingWorkItems(
        { org: auth.org, accessToken: auth.accessToken, projectId },
        ids as number[]
      );
      res.status(200).json({ existing });
    } catch (error) {
      console.error('Work item existence check error:', error);
      if (isAzureAuthError(error)) {
        res.status(401).json({ error: 'Session expired. Please reconnect to Azure DevOps.' });
        return;
      }
      res.status(500).json({ error: 'Failed to check work items' });
    }
    return;
  }

  const id = req.query.id;
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Missing id query parameter' });
    return;
  }

  const workItemId = parsePositiveInt(id);
  if (workItemId === null) {
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
