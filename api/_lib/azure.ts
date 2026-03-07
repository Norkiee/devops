import { AzureProject, AzureStory, AzureTask, AzureUserStory, AzureWorkItemDetails, AzureEpic, AzureFeature } from './types';

const AZURE_API_VERSION = '7.1';
const FETCH_TIMEOUT_MS = 30000; // 30 second timeout

interface AzureApiOptions {
  org: string;
  accessToken: string;
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
    return processResponse(response);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(`Request timed out after ${FETCH_TIMEOUT_MS}ms: ${url}`);
    }
    throw error;
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
  const wiqlQuery = {
    query: `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType]
            FROM WorkItems
            WHERE [System.WorkItemType] IN ('User Story', 'Product Backlog Item', 'Requirement', 'Issue')
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

export async function createTask(
  opts: AzureApiOptions & { projectId: string },
  task: AzureTask
): Promise<{ id: number; url: string }> {
  const patchDoc: Array<{ op: string; path: string; value: unknown }> = [
    { op: 'add', path: '/fields/System.Title', value: task.title },
    {
      op: 'add',
      path: '/fields/System.Description',
      value: task.description,
    },
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
  // Use WorkItemLinks to find User Stories linked to the Epic
  const wiqlQuery = {
    query: `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType]
            FROM WorkItemLinks
            WHERE ([Source].[System.Id] = ${opts.epicId})
            AND ([System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward')
            AND ([Target].[System.WorkItemType] = 'User Story')
            AND ([Target].[System.State] <> 'Closed')
            AND ([Target].[System.State] <> 'Removed')
            MODE (MustContain)`,
  };

  const wiqlResponse = await azureFetch(
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/wiql?api-version=${AZURE_API_VERSION}`,
    opts.accessToken,
    { method: 'POST', body: JSON.stringify(wiqlQuery) }
  );
  const wiqlData = (await wiqlResponse.json()) as {
    workItemRelations?: Array<{ target?: { id: number } }>;
  };

  if (!wiqlData.workItemRelations || wiqlData.workItemRelations.length === 0) {
    return [];
  }

  // Extract target IDs (the User Stories)
  const ids = wiqlData.workItemRelations
    .filter((rel) => rel.target?.id)
    .map((rel) => rel.target!.id)
    .slice(0, 50);

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
    acceptanceCriteria: data.fields['Microsoft.VSTS.Common.AcceptanceCriteria'],
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
      path: '/fields/System.Description',
      value: story.description,
    },
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

  // Add acceptance criteria if provided
  if (story.acceptanceCriteria) {
    patchDoc.push({
      op: 'add',
      path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria',
      value: story.acceptanceCriteria,
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
  const wiqlData = (await wiqlResponse.json()) as {
    workItemRelations?: Array<{ target?: { id: number } }>;
  };

  if (!wiqlData.workItemRelations || wiqlData.workItemRelations.length === 0) {
    return [];
  }

  const ids = wiqlData.workItemRelations
    .filter((rel) => rel.target?.id)
    .map((rel) => rel.target!.id)
    .slice(0, 50);

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

  // Add acceptance criteria if provided
  if (epic.acceptanceCriteria) {
    patchDoc.push({
      op: 'add',
      path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria',
      value: epic.acceptanceCriteria,
    });
  }

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

  // Add acceptance criteria if provided
  if (feature.acceptanceCriteria) {
    patchDoc.push({
      op: 'add',
      path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria',
      value: feature.acceptanceCriteria,
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
