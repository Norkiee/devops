// Work item types that can be generated
export type WorkItemType = 'Epic' | 'Feature' | 'UserStory' | 'Task';

// Work item type info from Azure DevOps
export interface WorkItemTypeInfo {
  name: string;
  referenceName: string;
  description?: string;
  icon?: string;
}

// Hierarchy context for AI generation
export interface HierarchyContext {
  epic?: {
    id: number;
    title: string;
    description?: string;
  };
  feature?: {
    id: number;
    title: string;
    description?: string;
    acceptanceCriteria?: string;
  };
  userStory?: {
    id: number;
    title: string;
    description?: string;
    acceptanceCriteria?: string;
  };
}

export interface FrameData {
  id: string;
  name: string;
  sectionName?: string; // Which Figma section this frame belongs to
  textContent: string[];
  componentNames: string[];
  nestedFrameNames: string[];
  width: number;
  height: number;
}

export interface SectionData {
  id: string;
  name: string;
  frames: FrameData[];
}

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria?: string; // Only for User Stories
  selected: boolean;
}

// Alias for backwards compatibility
export type TaskItem = WorkItem;

export interface FrameWorkItems {
  frameId: string;
  frameName: string;
  sectionName?: string;
  workItems: WorkItem[];
}

// Alias for backwards compatibility - FrameTasks uses 'tasks' property
export interface FrameTasks {
  frameId: string;
  frameName: string;
  sectionName?: string;
  tasks: WorkItem[];
}

export interface AzureProject {
  id: string;
  name: string;
}

export interface AzureStory {
  id: number;
  title: string;
  state: string;
  type: 'Epic' | 'Feature' | 'User Story';
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

export interface UserStoryToSubmit {
  workItemId: string;
  title: string;
  description: string;
  acceptanceCriteria?: string;
  tags: string[];
  parentEpicId: number;
}

export interface EpicToSubmit {
  workItemId: string;
  title: string;
  description: string;
  acceptanceCriteria?: string;
  tags: string[];
}

export interface FeatureToSubmit {
  workItemId: string;
  title: string;
  description: string;
  acceptanceCriteria?: string;
  parentEpicId?: number;
  tags: string[];
}

export interface CreateUserStoryResult {
  workItemId: string;
  success: boolean;
  azureId?: number;
  url?: string;
  error?: string;
}

export interface CreateEpicResult {
  workItemId: string;
  success: boolean;
  azureId?: number;
  url?: string;
  error?: string;
}

export interface CreateFeatureResult {
  workItemId: string;
  success: boolean;
  azureId?: number;
  url?: string;
  error?: string;
}

export interface AzureWorkItemDetails {
  id: number;
  type: 'Epic' | 'Feature' | 'User Story' | 'Task';
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  state: string;
  parentId?: number;
}

export interface PluginStorage {
  azureProjectId?: string;
  azureOrg?: string;
  lastStoryId?: number;
  lastEpicId?: number;
  lastFeatureId?: number;
  lastWorkItemType?: WorkItemType;
  frequentTags?: string[];
  sessionId?: string;
  // Note: accessToken is stored for session persistence across plugin restarts.
  // For higher security, consider storing only sessionId and refreshing tokens on each session.
  accessToken?: string;
}

export type Screen =
  | 'home'
  | 'connect-azure'
  | 'select-project'
  | 'work-item-type'
  | 'context'
  | 'generating'
  | 'review'
  | 'submitting'
  | 'success'
  | 'partial-failure';
