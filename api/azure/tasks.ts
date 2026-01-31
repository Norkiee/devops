import { VercelRequest, VercelResponse } from '@vercel/node';
import { createTask } from '../_lib/azure';
import { AzureTask, CreateTaskResult } from '../_lib/types';
import { requireAuth, handleCors } from '../_lib/auth';

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
    tasks?: AzureTask[];
  };

  if (!projectId || !tasks || !Array.isArray(tasks) || tasks.length === 0) {
    res.status(400).json({ error: 'Missing projectId or tasks' });
    return;
  }

  try {
    const results: CreateTaskResult[] = await Promise.all(
      tasks.map(async (task, index) => {
        try {
          const result = await createTask(
            {
              org: auth.org,
              accessToken: auth.accessToken,
              projectId,
            },
            task
          );
          return {
            frameId: String(index),
            success: true,
            taskId: result.id,
            taskUrl: result.url,
          };
        } catch (error) {
          return {
            frameId: String(index),
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
    res.status(500).json({ error: 'Failed to create tasks' });
  }
}
