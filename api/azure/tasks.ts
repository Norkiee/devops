import { VercelRequest, VercelResponse } from '@vercel/node';
import { createTask, getCurrentUser, getTaskInProgressState, getTaskClosedState, setTaskState, settleWithConcurrency, AZURE_CREATE_CONCURRENCY } from '../_lib/azure';
import { TaskToCreate, CreateTaskResult } from '../_lib/types';
import { requireAuth, handleCors, isAzureAuthError } from '../_lib/auth';

// Maps a settled per-item batch (create or close) to the API result shape,
// flagging auth errors via the callback. `idAt` supplies the taskId for the
// rejected case, where the worker's value isn't available.
function toResults(
  settled: PromiseSettledResult<{ taskId: string; azureTaskId: number; taskUrl: string }>[],
  idAt: (index: number) => string,
  action: 'creating' | 'closing',
  onAuthError: () => void
): CreateTaskResult[] {
  return settled.map((s, index) => {
    if (s.status === 'fulfilled') {
      return {
        taskId: s.value.taskId,
        success: true,
        azureTaskId: s.value.azureTaskId,
        taskUrl: s.value.taskUrl,
      };
    }
    if (isAzureAuthError(s.reason)) onAuthError();
    return {
      taskId: idAt(index),
      success: false,
      error: s.reason instanceof Error ? s.reason.message : `Unknown error ${action} task`,
    };
  });
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

  const { projectId, tasks, closeIds } = req.body as {
    projectId?: string;
    tasks?: TaskToCreate[];
    closeIds?: number[];
  };

  const hasTasks = Array.isArray(tasks) && tasks.length > 0;
  const hasCloseIds = Array.isArray(closeIds) && closeIds.length > 0;
  if (!projectId || (!hasTasks && !hasCloseIds)) {
    res.status(400).json({ error: 'Missing projectId or tasks/closeIds' });
    return;
  }

  let hasAuthError = false;

  try {
    // ── Create new tasks ────────────────────────────────────────────
    let results: CreateTaskResult[] | undefined;
    if (hasTasks) {
      const currentUser = await getCurrentUser(auth.accessToken);
      const inProgressState = await getTaskInProgressState({
        org: auth.org,
        accessToken: auth.accessToken,
        projectId,
      });

      // Bounded concurrency + per-task settle: captures both successes and
      // failures without bursting Azure's rate limit or losing partial results.
      const settledResults = await settleWithConcurrency(
        tasks!,
        AZURE_CREATE_CONCURRENCY,
        async (task) => {
          const result = await createTask(
            { org: auth.org, accessToken: auth.accessToken, projectId },
            {
              title: task.title,
              description: task.description,
              parentStoryId: task.parentStoryId,
              tags: task.tags,
              state: inProgressState,
              assignedTo: currentUser.emailAddress,
            }
          );
          return { taskId: task.taskId, azureTaskId: result.id, taskUrl: result.url };
        }
      );

      results = toResults(
        settledResults,
        (i) => tasks![i].taskId,
        'creating',
        () => { hasAuthError = true; }
      );
    }

    // ── Close existing tasks (transition to the completed state) ─────
    let closeResults: CreateTaskResult[] | undefined;
    if (hasCloseIds) {
      const closedState = await getTaskClosedState({
        org: auth.org,
        accessToken: auth.accessToken,
        projectId,
      });
      const settled = await settleWithConcurrency(
        closeIds!,
        AZURE_CREATE_CONCURRENCY,
        async (id) => {
          const result = await setTaskState(
            { org: auth.org, accessToken: auth.accessToken, projectId },
            id,
            closedState
          );
          return { taskId: String(id), azureTaskId: result.id, taskUrl: result.url };
        }
      );
      closeResults = toResults(
        settled,
        (i) => String(closeIds![i]),
        'closing',
        () => { hasAuthError = true; }
      );
    }

    if (hasAuthError) {
      res.status(401).json({
        error: 'Session expired. Please reconnect to Azure DevOps.',
        results,
        closeResults,
      });
      return;
    }

    res.status(200).json({ results, closeResults });
  } catch (error) {
    console.error('Tasks error:', error);
    if (isAzureAuthError(error)) {
      res.status(401).json({ error: 'Session expired. Please reconnect to Azure DevOps.' });
      return;
    }
    res.status(500).json({ error: 'Failed to create/close tasks' });
  }
}
