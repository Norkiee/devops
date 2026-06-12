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
          Authorization: `Bearer ${accessToken}`,
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
    // Throw specific error for auth failures so they can be forwarded as 401
    // Also check for common auth error messages in response body
    const isAuthError =
      response.status === 401 ||
      response.status === 403 ||
      errorText.toLowerCase().includes('unauthorized') ||
      errorText.toLowerCase().includes('token') ||
      errorText.toLowerCase().includes('expired') ||
      errorText.toLowerCase().includes('invalid_token') ||
      errorText.toLowerCase().includes('access denied');
    if (isAuthError) {
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

export async function getCurrentUser(
  accessToken: string
): Promise<UserProfile> {
  const profileResponse = await azureFetch(
    'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1',
    accessToken
  );
  const profile = (await profileResponse.json()) as {
    id: string;
    displayName: string;
    emailAddress: string;
  };
  return {
    id: profile.id,
    displayName: profile.displayName,
    emailAddress: profile.emailAddress,
  };
}

export async function listOrganizations(
  accessToken: string
): Promise<string[]> {
  // First get the user's profile to get their member ID
  const profile = await getCurrentUser(accessToken);

  // Then get their organizations using the member ID
  const accountsResponse = await azureFetch(
    `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${profile.id}&api-version=7.1`,
    accessToken
  );
  const accounts = (await accountsResponse.json()) as {
    value: Array<{ accountName: string }>;
  };
  return accounts.value.map((a) => a.accountName);
}

export async function listProjects(
  opts: AzureApiOptions
): Promise<AzureProject[]> {
  const response = await azureFetch(
    `https://dev.azure.com/${opts.org}/_apis/projects?api-version=${AZURE_API_VERSION}`,
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
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/wiql?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    { method: 'POST', body: JSON.stringify(wiqlQuery) }
  );
  const wiqlData = (await wiqlResponse.json()) as {
    workItems?: Array<{ id: number }>;
  };

  if (!wiqlData.workItems || wiqlData.workItems.length === 0) {
    return [];
  }

  const ids = wiqlData.workItems
    .slice(0, 50)
    .map((wi) => wi.id);
  const idsParam = ids.join(',');

  const detailResponse = await azureFetch(
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/workitems?ids=${idsParam}&fields=System.Id,System.Title,System.State,System.WorkItemType&api-version=${AZURE_API_VERSION}`,
    opts.accessToken
  );
  const detailData = (await detailResponse.json()) as {
    value: Array<{ id: number; fields: Record<string, string> }>;
  };

  return detailData.value.map((wi) => ({
    id: wi.id,
    title: wi.fields['System.Title'],
    state: wi.fields['System.State'],
    type: wi.fields['System.WorkItemType'] as 'Epic' | 'Feature' | 'User Story',
  }));
}

export async function getTags(
  opts: AzureApiOptions & { projectId: string }
): Promise<string[]> {
  const response = await azureFetch(
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/tags?api-version=${AZURE_API_VERSION}`,
    opts.accessToken
  );
  const data = (await response.json()) as { value: Array<{ name: string }> };
  return data.value.map((t) => t.name);
}

// Resolve the "in-progress" state name for the Task type in this project. The
// name varies by process template (Agile→Active, Basic→Doing, Scrum→In
// Progress), so we read the type's states and pick the one in the InProgress
// category rather than hardcoding a value that breaks on non-Agile projects.
// Falls back to 'Active' if the states API is unavailable.
export async function getTaskInProgressState(
  opts: AzureApiOptions & { projectId: string }
): Promise<string> {
  try {
    const response = await azureFetch(
      `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/workitemtypes/Task/states?api-version=${AZURE_API_VERSION}`,
      opts.accessToken
    );
    const data = (await response.json()) as {
      value: Array<{ name: string; category?: string; stateCategory?: string }>;
    };
    const inProgress = data.value.find(
      (s) => (s.stateCategory || s.category) === 'InProgress'
    );
    return inProgress?.name || 'Active';
  } catch {
    return 'Active';
  }
}

export async function createTask(
  opts: AzureApiOptions & { projectId: string },
  task: AzureTask
): Promise<{ id: number; url: string }> {
  const patchDoc: Array<{ op: string; path: string; value: unknown }> = [
    { op: 'add', path: '/fields/System.Title', value: task.title },
    {
      op: 'add',
      path: '/fields/System.Tags',
      value: task.tags.join('; '),
    },
    {
      op: 'add',
      path: '/relations/-',
      value: {
        rel: 'System.LinkTypes.Hierarchy-Reverse',
        url: `https://dev.azure.com/${opts.org}/_apis/wit/workItems/${task.parentStoryId}`,
      },
    },
  ];

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

  // Set the work item state when provided (e.g. the process's in-progress state).
  if (task.state) {
    patchDoc.push({
      op: 'add',
      path: '/fields/System.State',
      value: task.state,
    });
  }

  // Add assigned user if provided
  if (task.assignedTo) {
    patchDoc.push({
      op: 'add',
      path: '/fields/System.AssignedTo',
      value: task.assignedTo,
    });
  }

  const response = await azureFetch(
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/workitems/$Task?api-version=${AZURE_API_VERSION}`,
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
    url: data._links?.html?.href || `https://dev.azure.com/${opts.org}/${opts.projectId}/_workitems/edit/${data.id}`,
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
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/wiql?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    { method: 'POST', body: JSON.stringify(wiqlQuery) }
  );
  const wiqlData = (await wiqlResponse.json()) as {
    workItems?: Array<{ id: number }>;
  };

  if (!wiqlData.workItems || wiqlData.workItems.length === 0) {
    return [];
  }

  const ids = wiqlData.workItems.slice(0, 50).map((wi) => wi.id);
  const idsParam = ids.join(',');

  const detailResponse = await azureFetch(
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/workitems?ids=${idsParam}&fields=System.Id,System.Title,System.State,System.WorkItemType&api-version=${AZURE_API_VERSION}`,
    opts.accessToken
  );
  const detailData = (await detailResponse.json()) as {
    value: Array<{ id: number; fields: Record<string, string> }>;
  };

  return detailData.value.map((wi) => ({
    id: wi.id,
    title: wi.fields['System.Title'],
    state: wi.fields['System.State'],
    type: wi.fields['System.WorkItemType'] as 'Epic' | 'Feature' | 'User Story',
  }));
}

export async function queryStoriesByEpic(
  opts: AzureApiOptions & { projectId: string; epicId: number }
): Promise<AzureStory[]> {
  const storyTypesClause = STORY_LIKE_TYPES.map(t => `'${t}'`).join(', ');
  const wiqlQuery = {
    query: `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType]
            FROM WorkItemLinks
            WHERE ([Source].[System.Id] = ${opts.epicId})
            AND ([System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward')
            AND ([Target].[System.WorkItemType] IN (${storyTypesClause}))
            AND ([Target].[System.State] <> 'Closed')
            AND ([Target].[System.State] <> 'Removed')
            MODE (MustContain)`,
  };

  const wiqlResponse = await azureFetch(
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/wiql?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    { method: 'POST', body: JSON.stringify(wiqlQuery) }
  );
  const wiqlData = (await wiqlResponse.json()) as WorkItemRelationsResponse;
  const ids = extractTargetIds(wiqlData);

  if (ids.length === 0) {
    return [];
  }

  const idsParam = ids.join(',');

  const detailResponse = await azureFetch(
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/workitems?ids=${idsParam}&fields=System.Id,System.Title,System.State,System.WorkItemType&api-version=${AZURE_API_VERSION}`,
    opts.accessToken
  );
  const detailData = (await detailResponse.json()) as {
    value: Array<{ id: number; fields: Record<string, string> }>;
  };

  return detailData.value.map((wi) => ({
    id: wi.id,
    title: wi.fields['System.Title'],
    state: wi.fields['System.State'],
    type: wi.fields['System.WorkItemType'] as 'Epic' | 'Feature' | 'User Story',
  }));
}

export async function getWorkItemDetails(
  opts: AzureApiOptions & { workItemId: number }
): Promise<AzureWorkItemDetails> {
  const response = await azureFetch(
    `https://dev.azure.com/${opts.org}/_apis/wit/workitems/${opts.workItemId}?$expand=relations&api-version=${AZURE_API_VERSION}`,
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
        url: `https://dev.azure.com/${opts.org}/_apis/wit/workItems/${story.parentEpicId}`,
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
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/workitems/$${encodeURIComponent(typeName)}?api-version=${AZURE_API_VERSION}`,
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
    url: data._links?.html?.href || `https://dev.azure.com/${opts.org}/${opts.projectId}/_workitems/edit/${data.id}`,
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
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/workitemtypes?api-version=${AZURE_API_VERSION}`,
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
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/wiql?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    { method: 'POST', body: JSON.stringify(wiqlQuery) }
  );
  const wiqlData = (await wiqlResponse.json()) as {
    workItems?: Array<{ id: number }>;
  };

  if (!wiqlData.workItems || wiqlData.workItems.length === 0) {
    return [];
  }

  const ids = wiqlData.workItems.slice(0, 50).map((wi) => wi.id);
  const idsParam = ids.join(',');

  const detailResponse = await azureFetch(
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/workitems?ids=${idsParam}&fields=System.Id,System.Title,System.State,System.WorkItemType&api-version=${AZURE_API_VERSION}`,
    opts.accessToken
  );
  const detailData = (await detailResponse.json()) as {
    value: Array<{ id: number; fields: Record<string, string> }>;
  };

  return detailData.value.map((wi) => ({
    id: wi.id,
    title: wi.fields['System.Title'],
    state: wi.fields['System.State'],
    type: wi.fields['System.WorkItemType'] as 'Epic' | 'Feature' | 'User Story',
  }));
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
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/wiql?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    { method: 'POST', body: JSON.stringify(wiqlQuery) }
  );
  const wiqlData = (await wiqlResponse.json()) as WorkItemRelationsResponse;
  const ids = extractTargetIds(wiqlData);

  if (ids.length === 0) {
    return [];
  }

  const idsParam = ids.join(',');

  const detailResponse = await azureFetch(
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/workitems?ids=${idsParam}&fields=System.Id,System.Title,System.State,System.WorkItemType&api-version=${AZURE_API_VERSION}`,
    opts.accessToken
  );
  const detailData = (await detailResponse.json()) as {
    value: Array<{ id: number; fields: Record<string, string> }>;
  };

  return detailData.value.map((wi) => ({
    id: wi.id,
    title: wi.fields['System.Title'],
    state: wi.fields['System.State'],
    type: wi.fields['System.WorkItemType'] as 'Epic' | 'Feature' | 'User Story',
  }));
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
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/workitems/$Epic?api-version=${AZURE_API_VERSION}`,
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
    url: data._links?.html?.href || `https://dev.azure.com/${opts.org}/${opts.projectId}/_workitems/edit/${data.id}`,
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
        url: `https://dev.azure.com/${opts.org}/_apis/wit/workItems/${feature.parentEpicId}`,
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
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/workitems/$Feature?api-version=${AZURE_API_VERSION}`,
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
    url: data._links?.html?.href || `https://dev.azure.com/${opts.org}/${opts.projectId}/_workitems/edit/${data.id}`,
  };
}
