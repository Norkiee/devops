import {
  FrameData,
  FrameTasks,
  AzureProject,
  AzureStory,
  CreateTaskResult,
  TaskToSubmit,
} from '../types';

const API_URL = 'https://devops-psi.vercel.app';

// Custom error class for authentication failures
export class AuthError extends Error {
  constructor(message: string = 'Session expired') {
    super(message);
    this.name = 'AuthError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Check if response is JSON
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!response.ok) {
    // Detect authentication failures (401 Unauthorized)
    if (response.status === 401) {
      throw new AuthError('Session expired. Please reconnect to Azure DevOps.');
    }

    // Try to parse JSON error, fallback to generic message
    if (isJson) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    throw new Error(`HTTP ${response.status}: Request failed`);
  }

  // Parse JSON response, handle non-JSON responses
  if (!isJson) {
    throw new Error('Invalid response from server');
  }

  return response.json();
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function generateTasks(
  frames: FrameData[],
  context?: string
): Promise<FrameTasks[]> {
  const data = await request<{ frameTasks: FrameTasks[] }>('/api/generate', {
    method: 'POST',
    body: JSON.stringify({ frames, context }),
  });
  return data.frameTasks;
}

export function getAuthUrl(state: string): string {
  return `${API_URL}/api/azure/auth?state=${encodeURIComponent(state)}`;
}

export async function pollAuthResult(
  state: string
): Promise<{ sessionId: string; accessToken: string } | null> {
  const data = await request<{
    status: string;
    sessionId?: string;
    accessToken?: string;
  }>(`/api/azure/poll?state=${encodeURIComponent(state)}`);

  if (data.status === 'complete' && data.sessionId && data.accessToken) {
    return { sessionId: data.sessionId, accessToken: data.accessToken };
  }
  return null;
}

export async function refreshToken(
  sessionId: string
): Promise<string> {
  const data = await request<{ accessToken: string }>(
    '/api/azure/refresh',
    {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }
  );
  return data.accessToken;
}

export async function fetchOrgs(
  accessToken: string
): Promise<string[]> {
  const data = await request<{ orgs: string[] }>(
    '/api/azure/orgs',
    { headers: authHeaders(accessToken) }
  );
  return data.orgs;
}

export async function fetchProjects(
  accessToken: string,
  org: string
): Promise<AzureProject[]> {
  const data = await request<{ projects: AzureProject[] }>(
    `/api/azure/projects?org=${encodeURIComponent(org)}`,
    { headers: authHeaders(accessToken) }
  );
  return data.projects;
}

export async function fetchStories(
  accessToken: string,
  org: string,
  projectId: string
): Promise<AzureStory[]> {
  const data = await request<{ stories: AzureStory[] }>(
    `/api/azure/stories?org=${encodeURIComponent(org)}&projectId=${encodeURIComponent(projectId)}`,
    { headers: authHeaders(accessToken) }
  );
  return data.stories;
}

export async function fetchTags(
  accessToken: string,
  org: string,
  projectId: string
): Promise<string[]> {
  const data = await request<{ tags: string[] }>(
    `/api/azure/tags?org=${encodeURIComponent(org)}&projectId=${encodeURIComponent(projectId)}`,
    { headers: authHeaders(accessToken) }
  );
  return data.tags;
}

export async function createTasks(
  accessToken: string,
  org: string,
  projectId: string,
  tasks: TaskToSubmit[]
): Promise<CreateTaskResult[]> {
  const data = await request<{ results: CreateTaskResult[] }>(
    `/api/azure/tasks?org=${encodeURIComponent(org)}`,
    {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        projectId,
        tasks: tasks.map((t) => ({
          taskId: t.taskId,
          title: t.title,
          description: t.description,
          parentStoryId: t.parentStoryId,
          tags: t.tags,
        })),
      }),
    }
  );
  return data.results;
}
