export interface FrameData {
  id: string;
  name: string;
  textContent: string[];
  componentNames: string[];
  width: number;
  height: number;
}

export interface GenerateRequest {
  frames: FrameData[];
  context?: string;
}

export interface GeneratedTask {
  frameId: string;
  frameName: string;
  title: string;
  description: string;
}

export interface GenerateResponse {
  tasks: GeneratedTask[];
}

export interface AzureTask {
  title: string;
  description: string;
  parentStoryId: number;
  tags: string[];
  state: 'New';
}

export interface CreateTasksRequest {
  projectId: string;
  tasks: AzureTask[];
}

export interface CreateTaskResult {
  frameId: string;
  success: boolean;
  taskId?: number;
  taskUrl?: string;
  error?: string;
}

export interface AzureProject {
  id: string;
  name: string;
}

export interface AzureStory {
  id: number;
  title: string;
  state: string;
}

export interface KVSession {
  refreshToken: string;
  expiresAt: number;
}
