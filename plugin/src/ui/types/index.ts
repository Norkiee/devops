export interface FrameData {
  id: string;
  name: string;
  textContent: string[];
  componentNames: string[];
  nestedFrameNames: string[];
  width: number;
  height: number;
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

export interface AzureProject {
  id: string;
  name: string;
}

export interface AzureStory {
  id: number;
  title: string;
  state: string;
}

export interface TaskToSubmit {
  taskId: string;
  title: string;
  description: string;
  tags: string[];
  parentStoryId: number;
}

export interface CreateTaskResult {
  taskId: string;
  success: boolean;
  azureTaskId?: number;
  taskUrl?: string;
  error?: string;
}

export interface PluginStorage {
  azureProjectId?: string;
  azureOrg?: string;
  lastStoryId?: number;
  frequentTags?: string[];
  sessionId?: string;
  accessToken?: string;
}

export type Screen =
  | 'home'
  | 'context'
  | 'generating'
  | 'connect-azure'
  | 'select-story'
  | 'review'
  | 'submitting'
  | 'success'
  | 'partial-failure';
