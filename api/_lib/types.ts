// Work item types that can be generated
export type WorkItemType = 'UserStory' | 'Task';

// Hierarchy context for AI generation
export interface HierarchyContext {
  epic?: {
    id: number;
    title: string;
    description?: string;
  };
  userStory?: {
    id: number;
    title: string;
    description?: string;
    acceptanceCriteria?: string;
  };
}

// Text element with inferred role based on styling
export interface TextElement {
  text: string;
  role: 'heading' | 'subheading' | 'body' | 'label' | 'button' | 'caption';
}

// Interactive UI elements detected from component names
export interface InteractiveElement {
  type: 'button' | 'input' | 'checkbox' | 'toggle' | 'dropdown' | 'link';
  label: string;
  variant?: string; // e.g., 'primary', 'secondary', 'icon'
}

// Section with metadata about its contents
export interface SectionInfo {
  name: string;
  elementCount: number;
  pattern?: 'form' | 'list' | 'grid' | 'card' | 'navigation';
}

// Detected layout pattern for the frame
export type LayoutPattern =
  | 'form'
  | 'list'
  | 'grid'
  | 'dashboard'
  | 'modal'
  | 'empty-state'
  | 'navigation'
  | 'detail'
  | 'unknown';

export interface FrameData {
  id: string;
  name: string;
  sectionName?: string; // Which Figma section this frame belongs to
  textContent: string[];
  componentNames: string[];
  nestedFrameNames: string[];
  width: number;
  height: number;
  // Enhanced extraction fields (optional for backwards compatibility)
  textElements?: TextElement[];
  interactiveElements?: InteractiveElement[];
  sections?: SectionInfo[];
  layoutPattern?: LayoutPattern;
}

export interface GenerateRequest {
  frames: FrameData[];
  context?: string;
  workItemType?: WorkItemType; // 'Task' by default for backwards compatibility
  hierarchyContext?: HierarchyContext;
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

// Alias for backwards compatibility
export type FrameTasks = FrameWorkItems & { tasks: WorkItem[] };

export interface GenerateResponse {
  workItemType: WorkItemType;
  frameWorkItems: FrameWorkItems[];
  // For backwards compatibility
  frameTasks?: FrameWorkItems[];
}

export interface AzureTask {
  title: string;
  description: string;
  parentStoryId: number;
  tags: string[];
  state: 'New';
  assignedTo?: string;
}

export interface AzureUserStory {
  title: string;
  description: string;
  acceptanceCriteria?: string;
  parentEpicId: number;
  tags: string[];
  state: 'New';
}

export interface UserStoryToCreate {
  workItemId: string;
  title: string;
  description: string;
  acceptanceCriteria?: string;
  parentEpicId: number;
  tags: string[];
}

export interface CreateUserStoryResult {
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
  type: 'Epic' | 'Feature' | 'User Story';
}

export interface KVSession {
  refreshToken: string;
  expiresAt: number;
}
