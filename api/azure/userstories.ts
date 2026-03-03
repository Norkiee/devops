import { VercelRequest, VercelResponse } from '@vercel/node';
import { createUserStory, AzureAuthError } from '../_lib/azure';
import { requireAuth, handleCors, isAzureAuthError } from '../_lib/auth';
import { UserStoryToCreate, CreateUserStoryResult } from '../_lib/types';

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

  const { projectId, stories } = req.body as {
    projectId?: string;
    stories?: UserStoryToCreate[];
  };

  if (!projectId || typeof projectId !== 'string') {
    res.status(400).json({ error: 'Missing projectId in request body' });
    return;
  }

  if (!stories || !Array.isArray(stories) || stories.length === 0) {
    res.status(400).json({ error: 'Missing or empty stories array' });
    return;
  }

  // Create all stories in parallel, capturing both successes and failures
  const createPromises = stories.map(async (story): Promise<CreateUserStoryResult> => {
    try {
      const result = await createUserStory(
        {
          org: auth.org,
          accessToken: auth.accessToken,
          projectId,
        },
        {
          title: story.title,
          description: story.description,
          acceptanceCriteria: story.acceptanceCriteria,
          parentEpicId: story.parentEpicId,
          tags: story.tags,
          state: 'New',
        }
      );
      return {
        workItemId: story.workItemId,
        success: true,
        azureId: result.id,
        url: result.url,
      };
    } catch (error) {
      console.error(`Failed to create story ${story.workItemId}:`, error);
      return {
        workItemId: story.workItemId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  const results = await Promise.all(createPromises);

  // Check if any failures were auth errors
  const hasAuthError = results.some(
    (r) => !r.success && r.error && isAzureAuthError(new Error(r.error))
  );

  if (hasAuthError) {
    res.status(401).json({
      error: 'Session expired. Please reconnect to Azure DevOps.',
      results,
    });
    return;
  }

  res.status(200).json({ results });
}
