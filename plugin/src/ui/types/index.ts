export interface FrameData {
  id: string;
  name: string;
  textContent: string[];
  componentNames: string[];
  width: number;
  height: number;
}

export interface GeneratedTask {
  frameId: string;
  frameName: string;
  title: string;
  description: string;
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
  frameId: string;
  frameName: string;
  title: string;
  description: string;
  tags: string[];
  parentStoryId: number;
}

export interface CreateTaskResult {
  frameId: string;
  success: boolean;
  taskId?: number;
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
