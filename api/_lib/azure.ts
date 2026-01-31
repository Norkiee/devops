import { AzureProject, AzureStory, AzureTask } from './types';

const AZURE_API_VERSION = '7.1';

interface AzureApiOptions {
  org: string;
  accessToken: string;
}

async function azureFetch(
  url: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Azure DevOps API error (${response.status}): ${errorText}`
    );
  }
  return response;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

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
  const wiqlQuery = {
    query: `SELECT [System.Id], [System.Title], [System.State]
            FROM WorkItems
            WHERE [System.WorkItemType] = 'User Story'
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
    `https://dev.azure.com/${opts.org}/${opts.projectId}/_apis/wit/workitems?ids=${idsParam}&fields=System.Id,System.Title,System.State&api-version=${AZURE_API_VERSION}`,
    opts.accessToken
  );
  const detailData = (await detailResponse.json()) as {
    value: Array<{ id: number; fields: Record<string, string> }>;
  };

  return detailData.value.map((wi) => ({
    id: wi.id,
    title: wi.fields['System.Title'],
    state: wi.fields['System.State'],
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
  const patchDoc = [
    { op: 'add', path: '/fields/System.Title', value: task.title },
    {
      op: 'add',
      path: '/fields/System.Description',
      value: task.description,
    },
    { op: 'add', path: '/fields/System.State', value: 'New' },
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
