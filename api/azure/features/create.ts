import { VercelRequest, VercelResponse } from '@vercel/node';
import { createFeature } from '../../_lib/azure';
import { AzureFeature } from '../../_lib/types';
import { requireAuth, handleCors, isAzureAuthError } from '../../_lib/auth';

interface FeatureToCreate {
  workItemId: string;
  title: string;
  description: string;
  acceptanceCriteria?: string;
  parentEpicId?: number;
  tags: string[];
}

interface CreateFeatureResult {
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

  const { projectId, features } = req.body as {
    projectId?: string;
    features?: FeatureToCreate[];
  };

  if (!projectId || typeof projectId !== 'string') {
    res.status(400).json({ error: 'Missing projectId' });
    return;
  }

  if (!features || !Array.isArray(features) || features.length === 0) {
    res.status(400).json({ error: 'No features provided' });
    return;
  }

  try {
    const results: CreateFeatureResult[] = await Promise.all(
      features.map(async (feature): Promise<CreateFeatureResult> => {
        try {
          const azureFeature: AzureFeature = {
            title: feature.title,
            description: feature.description,
            acceptanceCriteria: feature.acceptanceCriteria,
            parentEpicId: feature.parentEpicId,
            tags: feature.tags,
            state: 'New',
          };

          const result = await createFeature(
            { org: auth.org, accessToken: auth.accessToken, projectId },
            azureFeature
          );

          return {
            workItemId: feature.workItemId,
            success: true,
            azureId: result.id,
            url: result.url,
          };
        } catch (err) {
          return {
            workItemId: feature.workItemId,
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
    console.error('Create features error:', error);
    if (isAzureAuthError(error)) {
      res.status(401).json({ error: 'Session expired. Please reconnect to Azure DevOps.' });
      return;
    }
    res.status(500).json({ error: 'Failed to create features' });
  }
}
