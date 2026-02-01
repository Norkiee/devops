import {
  FrameData,
  GeneratedTask,
  AzureProject,
  AzureStory,
  CreateTaskResult,
  TaskToSubmit,
} from '../types';

const API_URL = 'https://devops-psi.vercel.app';

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

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function generateTasks(
  frames: FrameData[],
  context?: string
): Promise<GeneratedTask[]> {
  const data = await request<{ tasks: GeneratedTask[] }>('/api/generate', {
    method: 'POST',
    body: JSON.stringify({ frames, context }),
  });
  return data.tasks;
}

export function getAuthUrl(): string {
  return `${API_URL}/api/azure/auth`;
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
          title: t.title,
          description: t.description,
          parentStoryId: t.parentStoryId,
          tags: t.tags,
          state: 'New' as const,
        })),
      }),
    }
  );
  return data.results;
}
