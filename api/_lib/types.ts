// Work item types that can be generated
export type WorkItemType = 'Epic' | 'Feature' | 'UserStory' | 'Task';

// Story-like work item types across Azure DevOps process templates
// Agile: User Story, Scrum: Product Backlog Item, CMMI: Requirement, Basic: Issue
export const STORY_LIKE_TYPES = ['User Story', 'Product Backlog Item', 'Requirement', 'Issue'] as const;
export type StoryLikeType = typeof STORY_LIKE_TYPES[number];

// WorkItemLinks API response structure
export interface WorkItemRelation {
  source?: { id: number } | null;
  target?: { id: number };
}

export interface WorkItemRelationsResponse {
  workItemRelations?: WorkItemRelation[];
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
  };
  userStory?: {
    id: number;
    title: string;
    description?: string;
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
  description?: string; // Optional - not used for User Stories
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
  description?: string;
  parentEpicId: number;
  tags: string[];
  state: 'New';
  assignedTo?: string;
}

export interface AzureEpic {
  title: string;
  description: string;
  tags: string[];
  state: 'New';
  assignedTo?: string;
}

export interface AzureFeature {
  title: string;
  description: string;
  parentEpicId?: number;
  tags: string[];
  state: 'New';
  assignedTo?: string;
}

export interface UserStoryToCreate {
  workItemId: string;
  title: string;
  description?: string;
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
