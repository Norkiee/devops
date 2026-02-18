import { VercelRequest, VercelResponse } from '@vercel/node';
import { listProjects } from '../_lib/azure';
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
