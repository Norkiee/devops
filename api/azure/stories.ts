import { VercelRequest, VercelResponse } from '@vercel/node';
import { queryStories, queryStoriesByEpic, createUserStory } from '../_lib/azure';
import { requireAuth, handleCors, isAzureAuthError } from '../_lib/auth';
import { UserStoryToCreate, CreateUserStoryResult } from '../_lib/types';

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
    const epicIdNum = epicId && typeof epicId === 'string' ? parseInt(epicId, 10) : undefined;

    try {
      let stories;
      if (epicIdNum && !isNaN(epicIdNum)) {
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
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
