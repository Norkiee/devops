import { VercelRequest, VercelResponse } from '@vercel/node';
import { createEpic, getCurrentUser } from '../../_lib/azure';
import { AzureEpic } from '../../_lib/types';
import { requireAuth, handleCors, isAzureAuthError } from '../../_lib/auth';

interface EpicToCreate {
  workItemId: string;
  title: string;
  description: string;
  acceptanceCriteria?: string;
  tags: string[];
}

interface CreateEpicResult {
  workItemId: string;
  success: boolean;
  azureId?: number;
  url?: string;
  error?: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = requireAuth(req, res);
  if (!auth) return;

  const { projectId, epics } = req.body as {
    projectId?: string;
    epics?: EpicToCreate[];
  };

  if (!projectId || typeof projectId !== 'string') {
    res.status(400).json({ error: 'Missing projectId' });
    return;
  }

  if (!epics || !Array.isArray(epics) || epics.length === 0) {
    res.status(400).json({ error: 'No epics provided' });
    return;
  }

  try {
    const results: CreateEpicResult[] = await Promise.all(
      epics.map(async (epic): Promise<CreateEpicResult> => {
        try {
          const azureEpic: AzureEpic = {
            title: epic.title,
            description: epic.description,
            acceptanceCriteria: epic.acceptanceCriteria,
            tags: epic.tags,
            state: 'New',
          };

          const result = await createEpic(
            { org: auth.org, accessToken: auth.accessToken, projectId },
            azureEpic
          );

          return {
            workItemId: epic.workItemId,
            success: true,
            azureId: result.id,
            url: result.url,
          };
        } catch (err) {
          return {
            workItemId: epic.workItemId,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          };
        }
      })
    );

    // Check if any auth errors occurred
    const hasAuthError = results.some(
      (r) => !r.success && r.error?.toLowerCase().includes('auth')
    );
    if (hasAuthError) {
      res.status(401).json({ error: 'Session expired', results });
      return;
    }

    res.status(200).json({ results });
  } catch (error) {
    console.error('Create epics error:', error);
    if (isAzureAuthError(error)) {
      res.status(401).json({ error: 'Session expired. Please reconnect to Azure DevOps.' });
      return;
    }
    res.status(500).json({ error: 'Failed to create epics' });
  }
}
