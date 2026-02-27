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
  type: 'Epic' | 'Feature' | 'User Story';
}

export interface KVSession {
  refreshToken: string;
  expiresAt: number;
}
