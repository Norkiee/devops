import { VercelRequest, VercelResponse } from '@vercel/node';
import { listProjects, getWorkItemTypes, getTags } from '../_lib/azure';
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
  const include = req.query.include; // 'types' or 'tags'

  // If projectId is provided with include parameter
  if (projectId && typeof projectId === 'string') {
    try {
      if (include === 'tags') {
        // Fetch tags for the project
        const tags = await getTags({
          org: auth.org,
          accessToken: auth.accessToken,
          projectId,
        });
        res.status(200).json({ tags });
        return;
      }

      // Default: fetch work item types for the project
      const workItemTypes = await getWorkItemTypes({
        org: auth.org,
        accessToken: auth.accessToken,
        projectId,
      });
      res.status(200).json({ workItemTypes });
    } catch (error) {
      console.error('Project details error:', error);
      if (isAzureAuthError(error)) {
        res.status(401).json({ error: 'Session expired. Please reconnect to Azure DevOps.' });
        return;
      }
      res.status(500).json({ error: 'Failed to fetch project details' });
    }
    return;
  }

  // Otherwise, fetch projects list
  try {
    const projects = await listProjects({
      org: auth.org,
      accessToken: auth.accessToken,
    });
    res.status(200).json({ projects });
  } catch (error) {
    console.error('Projects error:', error);
    if (isAzureAuthError(error)) {
      res.status(401).json({ error: 'Session expired. Please reconnect to Azure DevOps.' });
      return;
    }
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
}
