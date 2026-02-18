import { VercelRequest, VercelResponse } from '@vercel/node';
import { createTask, getCurrentUser } from '../_lib/azure';
import { TaskToCreate, CreateTaskResult } from '../_lib/types';
import { requireAuth, handleCors, isAzureAuthError } from '../_lib/auth';

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

  const { projectId, tasks } = req.body as {
    projectId?: string;
    tasks?: TaskToCreate[];
  };

  if (!projectId || !tasks || !Array.isArray(tasks) || tasks.length === 0) {
    res.status(400).json({ error: 'Missing projectId or tasks' });
    return;
  }

  try {
    // Get current user to auto-assign tasks
    const currentUser = await getCurrentUser(auth.accessToken);

    const results: CreateTaskResult[] = await Promise.all(
      tasks.map(async (task) => {
        try {
          const result = await createTask(
            {
              org: auth.org,
              accessToken: auth.accessToken,
              projectId,
            },
            {
              title: task.title,
              description: task.description,
              parentStoryId: task.parentStoryId,
              tags: task.tags,
              state: 'New',
              assignedTo: currentUser.emailAddress,
            }
          );
          return {
            taskId: task.taskId,
            success: true,
            azureTaskId: result.id,
            taskUrl: result.url,
          };
        } catch (error) {
          // Re-throw auth errors to be handled at top level
          if (isAzureAuthError(error)) {
            throw error;
          }
          return {
            taskId: task.taskId,
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unknown error creating task',
          };
        }
      })
    );

    res.status(200).json({ results });
  } catch (error) {
    console.error('Tasks error:', error);
    if (isAzureAuthError(error)) {
      res.status(401).json({ error: 'Session expired. Please reconnect to Azure DevOps.' });
      return;
    }
    res.status(500).json({ error: 'Failed to create tasks' });
  }
}
