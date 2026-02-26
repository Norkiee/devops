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

    // Use Promise.allSettled to capture both successes and failures
    // This prevents losing successful results when some tasks fail
    const settledResults = await Promise.allSettled(
      tasks.map(async (task) => {
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
          azureTaskId: result.id,
          taskUrl: result.url,
        };
      })
    );

    // Check if any auth errors occurred (should trigger session expired)
    let hasAuthError = false;
    const results: CreateTaskResult[] = settledResults.map((settled, index) => {
      if (settled.status === 'fulfilled') {
        return {
          taskId: settled.value.taskId,
          success: true,
          azureTaskId: settled.value.azureTaskId,
          taskUrl: settled.value.taskUrl,
        };
      } else {
        const error = settled.reason;
        if (isAzureAuthError(error)) {
          hasAuthError = true;
        }
        return {
          taskId: tasks[index].taskId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error creating task',
        };
      }
    });

    // If any auth errors, return 401 but still include partial results
    if (hasAuthError) {
      res.status(401).json({
        error: 'Session expired. Please reconnect to Azure DevOps.',
        results
      });
      return;
    }

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
