export interface FrameData {
  id: string;
  name: string;
  textContent: string[];
  componentNames: string[];
  nestedFrameNames: string[];
  width: number;
  height: number;
}

export interface GenerateRequest {
  frames: FrameData[];
  context?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  selected: boolean;
}

export interface FrameTasks {
  frameId: string;
  frameName: string;
  tasks: TaskItem[];
}

export interface GenerateResponse {
  frameTasks: FrameTasks[];
}

export interface AzureTask {
  title: string;
  description: string;
  parentStoryId: number;
  tags: string[];
  state: 'New';
  assignedTo?: string;
}

export interface TaskToCreate {
  taskId: string;
  title: string;
  description: string;
  parentStoryId: number;
  tags: string[];
}

export interface CreateTasksRequest {
  org: string;
  projectId: string;
  tasks: TaskToCreate[];
}

export interface CreateTaskResult {
  taskId: string;
  success: boolean;
  azureTaskId?: number;
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
