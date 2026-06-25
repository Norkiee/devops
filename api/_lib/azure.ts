import { AzureProject, AzureStory, AzureTask, AzureUserStory, AzureWorkItemDetails, AzureEpic, AzureFeature, STORY_LIKE_TYPES, WorkItemRelationsResponse } from './types';

const AZURE_API_VERSION = '7.1';
const FETCH_TIMEOUT_MS = 30000; // 30 second timeout

// Azure DevOps throttles bursts with 429 (and occasionally 503). Both mean the
// request was NOT processed, so retrying is safe — no risk of duplicate creates.
const RETRYABLE_STATUS = new Set([429, 503]);
const MAX_AZURE_RETRIES = 4;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 10000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (!Number.isNaN(secs) && secs >= 0) {
      return Math.min(secs * 1000, MAX_RETRY_DELAY_MS);
    }
  }
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

// Default cap on in-flight work-item creates, shared by every bulk endpoint so
// a large batch doesn't burst Azure's rate limit.
export const AZURE_CREATE_CONCURRENCY = 5;

// Runs `worker` over items with a bounded number of in-flight calls, returning
// allSettled-style results. Keeps bulk creates from bursting Azure's rate limit.
export async function settleWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await worker(items[i], i) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }
  const lanes = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(lanes);
  return results;
}

// Like Promise.all(items.map(worker)) but with bounded concurrency, preserving
// input order. Use when the worker handles its own errors (returns a result
// object) so a throw is exceptional and should reject like Promise.all.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  const lanes = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(lanes);
  return results;
}

interface AzureApiOptions {
  org: string;
  accessToken: string;
}

// Azure org and project segments come from client input and are interpolated
// into request URLs. Encode them so a value containing '/', '?', '#', or
// whitespace can't break out of its path segment (path/query injection). These
// requests always use the caller's own token, so this is defense-in-depth.
function seg(value: string): string {
  return encodeURIComponent(value);
}

// Upper bound on items surfaced in a dropdown. Callers order by ChangedDate DESC,
// so this keeps the most recently active items when a project is very large.
const MAX_WORK_ITEMS = 500;

// Fetch id/title/state/type for many work items. Azure's batch endpoint accepts
// up to 200 ids per call, so chunk to avoid truncating large result sets (the
// old single-call code silently capped lists at ~50/200).
async function fetchWorkItemsByIds(
  opts: AzureApiOptions & { projectId: string },
  ids: number[]
): Promise<AzureStory[]> {
  const results: AzureStory[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const idsParam = ids.slice(i, i + 200).join(',');
    const response = await azureFetch(
      `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_apis/wit/workitems?ids=${idsParam}&fields=System.Id,System.Title,System.State,System.WorkItemType&api-version=${AZURE_API_VERSION}`,
      opts.accessToken
    );
    const data = (await response.json()) as {
      value?: Array<{ id: number; fields: Record<string, string> }>;
    };
    for (const wi of data.value || []) {
      results.push({
        id: wi.id,
        title: wi.fields['System.Title'],
        state: wi.fields['System.State'],
        type: wi.fields['System.WorkItemType'] as 'Epic' | 'Feature' | 'User Story',
      });
    }
  }
  return results;
}

// Extract target IDs from WorkItemLinks response, filtering out the source entry
function extractTargetIds(response: WorkItemRelationsResponse, limit = 50): number[] {
  if (!response.workItemRelations || response.workItemRelations.length === 0) {
    return [];
  }
  return response.workItemRelations
    .filter((rel) => rel.source && rel.target?.id)
    .map((rel) => rel.target!.id)
    .slice(0, limit);
}

// Custom error class for Azure auth failures
export class AzureAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AzureAuthError';
  }
}

// Custom error class for timeout
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// Azure DevOps PATs authenticate via HTTP Basic with an empty username:
// `Authorization: Basic base64(":" + PAT)`. `token` here is the user's PAT,
// forwarded by the plugin in the request's Authorization header.
function patAuthHeader(token: string): string {
  return `Basic ${Buffer.from(`:${token}`).toString('base64')}`;
}

async function azureFetch(
  url: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: patAuthHeader(accessToken),
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      clearTimeout(timeoutId);

      // Retry on throttling (429) / transient unavailability (503), honoring
      // Retry-After. These statuses mean the request was not applied, so a
      // retry cannot create a duplicate work item.
      if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_AZURE_RETRIES) {
        const delay = retryDelayMs(response, attempt);
        // Drain the body so the connection can be reused.
        await response.text().catch(() => undefined);
        await sleep(delay);
        continue;
      }

      return processResponse(response);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${FETCH_TIMEOUT_MS}ms: ${url}`);
      }
      throw error;
    }
  }
}

async function processResponse(response: Response): Promise<Response> {
  if (!response.ok) {
    const errorText = await response.text();
    // Only Azure 401/403 responses are treated as auth failures. Body text is
    // too noisy for classification: ordinary work item validation errors can
    // contain words like "token" or Azure codes such as VS403xxx.
    if (response.status === 401 || response.status === 403) {
      throw new AzureAuthError(
        `Authentication failed (${response.status}): ${errorText}`
      );
    }
    throw new Error(
      `Azure DevOps API error (${response.status}): ${errorText}`
    );
  }
  return response;
}

export interface UserProfile {
  id: string;
  displayName: string;
  emailAddress: string;
}

// Resolve the authenticated user from the ORG-scoped connectionData endpoint.
// We deliberately avoid the global app.vssps.visualstudio.com profile service:
// an org-scoped PAT authenticates fine against dev.azure.com/{org} (so reads
// work) but is frequently rejected by the global service, which made task
// creation fail with a false "token rejected".
export async function getCurrentUser(
  accessToken: string,
  org: string
): Promise<UserProfile> {
  const response = await azureFetch(
    `https://dev.azure.com/${seg(org)}/_apis/connectionData`,
    accessToken
  );
  const data = (await response.json()) as {
    authenticatedUser?: {
      id?: string;
      providerDisplayName?: string;
      properties?: { Account?: { $value?: string } };
    };
  };
  const user = data.authenticatedUser;
  const email = user?.properties?.Account?.$value || '';
  return {
    id: user?.id || '',
    displayName: user?.providerDisplayName || '',
    // AssignedTo resolves by UPN/email; fall back to the display name.
    emailAddress: email || user?.providerDisplayName || '',
  };
}

export async function listProjects(
  opts: AzureApiOptions
): Promise<AzureProject[]> {
  const response = await azureFetch(
    `https://dev.azure.com/${seg(opts.org)}/_apis/projects?api-version=${AZURE_API_VERSION}`,
    opts.accessToken
  );
  const data = (await response.json()) as { value: Array<{ id: string; name: string }> };
  return data.value.map((p) => ({
    id: p.id,
    name: p.name,
  }));
}

export async function queryStories(
  opts: AzureApiOptions & { projectId: string }
): Promise<AzureStory[]> {
  // Query for story-like work items (not Epics or Features)
  const storyTypesClause = STORY_LIKE_TYPES.map(t => `'${t}'`).join(', ');
  const wiqlQuery = {
    query: `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType]
            FROM WorkItems
            WHERE [System.WorkItemType] IN (${storyTypesClause})
            AND [System.State] <> 'Closed'
            AND [System.State] <> 'Removed'
            ORDER BY [System.ChangedDate] DESC`,
  };

  const wiqlResponse = await azureFetch(
    `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_apis/wit/wiql?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    { method: 'POST', body: JSON.stringify(wiqlQuery) }
  );
  const wiqlData = (await wiqlResponse.json()) as {
    workItems?: Array<{ id: number }>;
  };

  const ids = (wiqlData.workItems || []).slice(0, MAX_WORK_ITEMS).map((wi) => wi.id);
  if (ids.length === 0) return [];
  return fetchWorkItemsByIds(opts, ids);
}

export async function getTags(
  opts: AzureApiOptions & { projectId: string }
): Promise<string[]> {
  const response = await azureFetch(
    `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_apis/wit/tags?api-version=${AZURE_API_VERSION}`,
    opts.accessToken
  );
  const data = (await response.json()) as { value: Array<{ name: string }> };
  return data.value.map((t) => t.name);
}

// A Task state name paired with its metastate category (Proposed, InProgress,
// Resolved, Completed, Removed). The category is the process-independent way to
// find "in progress" or "done" regardless of the state's display name.
export interface TaskStateInfo {
  name: string;
  category: string;
}

// Read the valid states for the Task type in this project. The API returns the
// category under `category` (older) or `stateCategory` (newer), so we normalize.
// Returns [] if the states API is unavailable.
export async function getTaskStates(
  opts: AzureApiOptions & { projectId: string }
): Promise<TaskStateInfo[]> {
  try {
    const response = await azureFetch(
      `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_apis/wit/workitemtypes/Task/states?api-version=${AZURE_API_VERSION}`,
      opts.accessToken
    );
    const data = (await response.json()) as {
      value: Array<{ name: string; category?: string; stateCategory?: string }>;
    };
    return data.value.map((s) => ({
      name: s.name,
      category: s.stateCategory || s.category || '',
    }));
  } catch {
    return [];
  }
}

// Resolve the "in-progress" state name (Agile→Active, Basic→Doing, Scrum→In
// Progress) by metastate category. Falls back to 'Active'.
export async function getTaskInProgressState(
  opts: AzureApiOptions & { projectId: string }
): Promise<string> {
  const states = await getTaskStates(opts);
  return states.find((s) => s.category === 'InProgress')?.name || 'Active';
}

// Resolve the "completed" state name (Agile→Closed, Basic/Scrum→Done) by
// metastate category. Falls back to 'Closed'.
export async function getTaskClosedState(
  opts: AzureApiOptions & { projectId: string }
): Promise<string> {
  const states = await getTaskStates(opts);
  return states.find((s) => s.category === 'Completed')?.name || 'Closed';
}

// Transition an existing work item to the given state via a state-only PATCH.
export async function setTaskState(
  opts: AzureApiOptions & { projectId: string },
  id: number,
  state: string
): Promise<{ id: number; url: string }> {
  const response = await azureFetch(
    `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_apis/wit/workitems/${id}?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify([
        { op: 'add', path: '/fields/System.State', value: state },
      ]),
    }
  );
  const data = (await response.json()) as {
    id: number;
    _links?: { html?: { href?: string } };
  };
  return {
    id: data.id,
    url: data._links?.html?.href || `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_workitems/edit/${data.id}`,
  };
}

export async function createTask(
  opts: AzureApiOptions & { projectId: string },
  task: AzureTask
): Promise<{ id: number; url: string; stateTransitioned: boolean; transitionError?: string }> {
  const patchDoc: Array<{ op: string; path: string; value: unknown }> = [
    { op: 'add', path: '/fields/System.Title', value: task.title },
    {
      op: 'add',
      path: '/fields/System.Tags',
      value: task.tags.join('; '),
    },
  ];

  // Link to a parent user story only when one was chosen. Some teams list tasks
  // with no parent, so an unparented Task is valid.
  if (task.parentStoryId) {
    patchDoc.push({
      op: 'add',
      path: '/relations/-',
      value: {
        rel: 'System.LinkTypes.Hierarchy-Reverse',
        url: `https://dev.azure.com/${seg(opts.org)}/_apis/wit/workItems/${task.parentStoryId}`,
      },
    });
  }

  // Only set Description when present. A JSON-patch "add" with an undefined
  // value serializes without the `value` key, which Azure rejects as
  // "Value cannot be null" — so tasks parsed from a tasklist (no description)
  // must omit the field entirely rather than send a null one.
  if (task.description) {
    patchDoc.push({
      op: 'add',
      path: '/fields/System.Description',
      value: task.description,
    });
  }

  // NOTE: System.State is deliberately NOT set here. On create, Azure's rules
  // engine validates State against the initial state's allowed values and
  // rejects a jump straight to e.g. 'Active' ("not in the list of supported
  // values") — even when that state is valid for the type. The work item must
  // be created in its default state first, then transitioned (see below).

  // Add assigned user if provided
  if (task.assignedTo) {
    patchDoc.push({
      op: 'add',
      path: '/fields/System.AssignedTo',
      value: task.assignedTo,
    });
  }

  const response = await azureFetch(
    `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_apis/wit/workitems/$Task?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify(patchDoc),
    }
  );
  const data = (await response.json()) as {
    id: number;
    _links?: { html?: { href?: string } };
  };

  // Transition to the requested state with a follow-up PATCH, retried a few
  // times since it's usually a transient failure. Kept best-effort on final
  // failure: the task IS created, and failing the call would make a retry
  // create a duplicate. The shortfall (task left in its default state) is
  // logged loudly rather than reported as a hard error.
  if (task.state) {
    let transitioned = false;
    let transitionError: string | undefined;
    for (let attempt = 1; attempt <= 3 && !transitioned; attempt++) {
      try {
        await setTaskState(opts, data.id, task.state);
        transitioned = true;
      } catch (err) {
        transitionError = err instanceof Error ? err.message : String(err);
        if (attempt === 3) {
          console.error(
            `Task ${data.id} created but transition to state '${task.state}' failed after ${attempt} attempts:`,
            err
          );
        }
      }
    }
    if (!transitioned) {
      return {
        id: data.id,
        url: data._links?.html?.href || `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_workitems/edit/${data.id}`,
        stateTransitioned: false,
        transitionError,
      };
    }
  }

  return {
    id: data.id,
    url: data._links?.html?.href || `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_workitems/edit/${data.id}`,
    stateTransitioned: true,
  };
}

export async function queryEpics(
  opts: AzureApiOptions & { projectId: string }
): Promise<AzureStory[]> {
  const wiqlQuery = {
    query: `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType]
            FROM WorkItems
            WHERE [System.WorkItemType] = 'Epic'
            AND [System.State] <> 'Closed'
            AND [System.State] <> 'Removed'
            ORDER BY [System.ChangedDate] DESC`,
  };

  const wiqlResponse = await azureFetch(
    `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_apis/wit/wiql?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    { method: 'POST', body: JSON.stringify(wiqlQuery) }
  );
  const wiqlData = (await wiqlResponse.json()) as {
    workItems?: Array<{ id: number }>;
  };

  if (!wiqlData.workItems || wiqlData.workItems.length === 0) {
    return [];
  }

  const ids = wiqlData.workItems.slice(0, MAX_WORK_ITEMS).map((wi) => wi.id);
  return fetchWorkItemsByIds(opts, ids);
}

export async function queryStoriesByEpic(
  opts: AzureApiOptions & { projectId: string; epicId: number }
): Promise<AzureStory[]> {
  // Stories sit directly under the epic or under its features (Epic → Feature →
  // Story). Collect the epic + its feature ids, then find story-like work items
  // whose parent is any of those. Plain field queries (System.Parent) are more
  // reliable across projects than a recursive WIQL tree query.
  const features = await queryFeaturesByEpic(opts);
  const parentIds = [opts.epicId, ...features.map((f) => f.id)];

  const storyTypesClause = STORY_LIKE_TYPES.map((t) => `'${t}'`).join(', ');
  const parentClause = parentIds.join(', ');
  const wiqlQuery = {
    query: `SELECT [System.Id]
            FROM WorkItems
            WHERE [System.WorkItemType] IN (${storyTypesClause})
            AND [System.Parent] IN (${parentClause})
            AND [System.State] <> 'Closed'
            AND [System.State] <> 'Removed'
            ORDER BY [System.ChangedDate] DESC`,
  };

  const wiqlResponse = await azureFetch(
    `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_apis/wit/wiql?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    { method: 'POST', body: JSON.stringify(wiqlQuery) }
  );
  const wiqlData = (await wiqlResponse.json()) as {
    workItems?: Array<{ id: number }>;
  };
  const ids = (wiqlData.workItems || []).slice(0, MAX_WORK_ITEMS).map((wi) => wi.id);
  if (ids.length === 0) return [];
  return fetchWorkItemsByIds(opts, ids);
}

// Stories whose direct parent is the given feature (open, story-like only).
export async function queryStoriesByFeature(
  opts: AzureApiOptions & { projectId: string; featureId: number }
): Promise<AzureStory[]> {
  const storyTypesClause = STORY_LIKE_TYPES.map((t) => `'${t}'`).join(', ');
  const wiqlQuery = {
    query: `SELECT [System.Id]
            FROM WorkItems
            WHERE [System.WorkItemType] IN (${storyTypesClause})
            AND [System.Parent] = ${opts.featureId}
            AND [System.State] <> 'Closed'
            AND [System.State] <> 'Removed'
            ORDER BY [System.ChangedDate] DESC`,
  };

  const wiqlResponse = await azureFetch(
    `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_apis/wit/wiql?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    { method: 'POST', body: JSON.stringify(wiqlQuery) }
  );
  const wiqlData = (await wiqlResponse.json()) as {
    workItems?: Array<{ id: number }>;
  };
  const ids = (wiqlData.workItems || []).slice(0, MAX_WORK_ITEMS).map((wi) => wi.id);
  if (ids.length === 0) return [];
  return fetchWorkItemsByIds(opts, ids);
}

export interface ExistingWorkItem {
  id: number;
  state: string;
  closed: boolean; // state is in the Completed or Removed metastate category
}

// Returns which of the given ids still exist in Azure, each with its current
// state and whether that state is "closed" (done/removed). `errorPolicy=omit`
// drops missing/deleted ids instead of failing the request — that's how the
// plugin detects a previously-created Task was deleted. Task states are read
// once to classify each item's state by metastate category.
export async function getExistingWorkItems(
  opts: AzureApiOptions & { projectId: string },
  ids: number[]
): Promise<ExistingWorkItem[]> {
  if (ids.length === 0) return [];
  const states = await getTaskStates(opts);
  const closedNames = new Set(
    states
      .filter((s) => s.category === 'Completed' || s.category === 'Removed')
      .map((s) => s.name)
  );

  // The batch endpoint accepts up to 200 ids per call — chunk so large
  // tasklists are fully verified. (Truncating would make the plugin treat the
  // dropped ids as deleted and re-create duplicates.)
  const results: ExistingWorkItem[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const idsParam = ids.slice(i, i + 200).join(',');
    const response = await azureFetch(
      `https://dev.azure.com/${seg(opts.org)}/_apis/wit/workitems?ids=${idsParam}&fields=System.Id,System.State&errorPolicy=omit&api-version=${AZURE_API_VERSION}`,
      opts.accessToken
    );
    const data = (await response.json()) as {
      value?: Array<{ id: number; fields: Record<string, string> }>;
    };
    for (const wi of data.value || []) {
      const state = wi.fields['System.State'];
      results.push({ id: wi.id, state, closed: closedNames.has(state) });
    }
  }
  return results;
}

export async function getWorkItemDetails(
  opts: AzureApiOptions & { workItemId: number }
): Promise<AzureWorkItemDetails> {
  const response = await azureFetch(
    `https://dev.azure.com/${seg(opts.org)}/_apis/wit/workitems/${opts.workItemId}?$expand=relations&api-version=${AZURE_API_VERSION}`,
    opts.accessToken
  );
  const data = (await response.json()) as {
    id: number;
    fields: Record<string, string>;
    relations?: Array<{ rel: string; url: string }>;
  };

  // Find parent ID from relations
  let parentId: number | undefined;
  if (data.relations) {
    const parentRel = data.relations.find(
      (r) => r.rel === 'System.LinkTypes.Hierarchy-Reverse'
    );
    if (parentRel) {
      // URL format: https://dev.azure.com/{org}/_apis/wit/workItems/{id}
      const match = parentRel.url.match(/workItems\/(\d+)/);
      if (match) {
        parentId = parseInt(match[1], 10);
      }
    }
  }

  return {
    id: data.id,
    type: data.fields['System.WorkItemType'] as 'Epic' | 'Feature' | 'User Story' | 'Task',
    title: data.fields['System.Title'],
    description: data.fields['System.Description'],
    state: data.fields['System.State'],
    parentId,
  };
}

export async function createUserStory(
  opts: AzureApiOptions & { projectId: string; workItemTypeName?: string },
  story: AzureUserStory
): Promise<{ id: number; url: string }> {
  // Use provided type name or default to "User Story"
  const typeName = opts.workItemTypeName || 'User Story';
  const patchDoc: Array<{ op: string; path: string; value: unknown }> = [
    { op: 'add', path: '/fields/System.Title', value: story.title },
    {
      op: 'add',
      path: '/fields/System.Tags',
      value: story.tags.join('; '),
    },
    {
      op: 'add',
      path: '/relations/-',
      value: {
        rel: 'System.LinkTypes.Hierarchy-Reverse',
        url: `https://dev.azure.com/${seg(opts.org)}/_apis/wit/workItems/${story.parentEpicId}`,
      },
    },
  ];

  // Add description if provided
  if (story.description) {
    patchDoc.push({
      op: 'add',
      path: '/fields/System.Description',
      value: story.description,
    });
  }

  // Add assigned user if provided
  if (story.assignedTo) {
    patchDoc.push({
      op: 'add',
      path: '/fields/System.AssignedTo',
      value: story.assignedTo,
    });
  }

  const response = await azureFetch(
    `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_apis/wit/workitems/$${encodeURIComponent(typeName)}?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify(patchDoc),
    }
  );
  const data = (await response.json()) as {
    id: number;
    _links?: { html?: { href?: string } };
  };
  return {
    id: data.id,
    url: data._links?.html?.href || `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_workitems/edit/${data.id}`,
  };
}

// Supported work item type names we care about
export type SupportedWorkItemType = 'Epic' | 'Feature' | 'User Story' | 'Product Backlog Item' | 'Requirement' | 'Issue' | 'Task';

export interface WorkItemTypeInfo {
  name: string;
  referenceName: string;
  description?: string;
  icon?: string;
}

export async function getWorkItemTypes(
  opts: AzureApiOptions & { projectId: string }
): Promise<WorkItemTypeInfo[]> {
  const response = await azureFetch(
    `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_apis/wit/workitemtypes?api-version=${AZURE_API_VERSION}`,
    opts.accessToken
  );
  const data = (await response.json()) as {
    value: Array<{
      name: string;
      referenceName: string;
      description?: string;
      icon?: { url?: string };
    }>;
  };

  // Filter to only return supported types that exist in this project
  const supportedTypes: SupportedWorkItemType[] = [
    'Epic',
    'Feature',
    'User Story',
    'Product Backlog Item',
    'Requirement',
    'Issue',
    'Task',
  ];

  return data.value
    .filter((wit) => supportedTypes.includes(wit.name as SupportedWorkItemType))
    .map((wit) => ({
      name: wit.name,
      referenceName: wit.referenceName,
      description: wit.description,
      icon: wit.icon?.url,
    }));
}

export async function queryFeatures(
  opts: AzureApiOptions & { projectId: string }
): Promise<AzureStory[]> {
  const wiqlQuery = {
    query: `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType]
            FROM WorkItems
            WHERE [System.WorkItemType] = 'Feature'
            AND [System.State] <> 'Closed'
            AND [System.State] <> 'Removed'
            ORDER BY [System.ChangedDate] DESC`,
  };

  const wiqlResponse = await azureFetch(
    `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_apis/wit/wiql?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    { method: 'POST', body: JSON.stringify(wiqlQuery) }
  );
  const wiqlData = (await wiqlResponse.json()) as {
    workItems?: Array<{ id: number }>;
  };

  if (!wiqlData.workItems || wiqlData.workItems.length === 0) {
    return [];
  }

  const ids = wiqlData.workItems.slice(0, MAX_WORK_ITEMS).map((wi) => wi.id);
  return fetchWorkItemsByIds(opts, ids);
}

export async function queryFeaturesByEpic(
  opts: AzureApiOptions & { projectId: string; epicId: number }
): Promise<AzureStory[]> {
  const wiqlQuery = {
    query: `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType]
            FROM WorkItemLinks
            WHERE ([Source].[System.Id] = ${opts.epicId})
            AND ([System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward')
            AND ([Target].[System.WorkItemType] = 'Feature')
            AND ([Target].[System.State] <> 'Closed')
            AND ([Target].[System.State] <> 'Removed')
            MODE (MustContain)`,
  };

  const wiqlResponse = await azureFetch(
    `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_apis/wit/wiql?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    { method: 'POST', body: JSON.stringify(wiqlQuery) }
  );
  const wiqlData = (await wiqlResponse.json()) as WorkItemRelationsResponse;
  const ids = extractTargetIds(wiqlData, MAX_WORK_ITEMS);
  if (ids.length === 0) return [];
  return fetchWorkItemsByIds(opts, ids);
}

export async function createEpic(
  opts: AzureApiOptions & { projectId: string },
  epic: AzureEpic
): Promise<{ id: number; url: string }> {
  const patchDoc: Array<{ op: string; path: string; value: unknown }> = [
    { op: 'add', path: '/fields/System.Title', value: epic.title },
    { op: 'add', path: '/fields/System.Description', value: epic.description },
    { op: 'add', path: '/fields/System.Tags', value: epic.tags.join('; ') },
  ];

  // Add assigned user if provided
  if (epic.assignedTo) {
    patchDoc.push({
      op: 'add',
      path: '/fields/System.AssignedTo',
      value: epic.assignedTo,
    });
  }

  const response = await azureFetch(
    `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_apis/wit/workitems/$Epic?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify(patchDoc),
    }
  );
  const data = (await response.json()) as {
    id: number;
    _links?: { html?: { href?: string } };
  };
  return {
    id: data.id,
    url: data._links?.html?.href || `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_workitems/edit/${data.id}`,
  };
}

export async function createFeature(
  opts: AzureApiOptions & { projectId: string },
  feature: AzureFeature
): Promise<{ id: number; url: string }> {
  const patchDoc: Array<{ op: string; path: string; value: unknown }> = [
    { op: 'add', path: '/fields/System.Title', value: feature.title },
    { op: 'add', path: '/fields/System.Description', value: feature.description },
    { op: 'add', path: '/fields/System.Tags', value: feature.tags.join('; ') },
  ];

  // Add parent epic link if provided
  if (feature.parentEpicId) {
    patchDoc.push({
      op: 'add',
      path: '/relations/-',
      value: {
        rel: 'System.LinkTypes.Hierarchy-Reverse',
        url: `https://dev.azure.com/${seg(opts.org)}/_apis/wit/workItems/${feature.parentEpicId}`,
      },
    });
  }

  // Add assigned user if provided
  if (feature.assignedTo) {
    patchDoc.push({
      op: 'add',
      path: '/fields/System.AssignedTo',
      value: feature.assignedTo,
    });
  }

  const response = await azureFetch(
    `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_apis/wit/workitems/$Feature?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify(patchDoc),
    }
  );
  const data = (await response.json()) as {
    id: number;
    _links?: { html?: { href?: string } };
  };
  return {
    id: data.id,
    url: data._links?.html?.href || `https://dev.azure.com/${seg(opts.org)}/${seg(opts.projectId)}/_workitems/edit/${data.id}`,
  };
}
