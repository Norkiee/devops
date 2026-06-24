// Story-like work item types across Azure DevOps process templates
// Agile: User Story, Scrum: Product Backlog Item, CMMI: Requirement, Basic: Issue
export const STORY_LIKE_TYPES = ['User Story', 'Product Backlog Item', 'Requirement', 'Issue'] as const;

// WorkItemLinks API response structure
export interface WorkItemRelation {
  source?: { id: number } | null;
  target?: { id: number };
}

export interface WorkItemRelationsResponse {
  workItemRelations?: WorkItemRelation[];
}

export interface AzureTask {
  title: string;
  description: string;
  // Optional: tasks may be created without a parent user story.
  parentStoryId?: number;
  tags: string[];
  // Process-specific state name. Agile→Active, Basic→Doing, Scrum→In Progress.
  // Resolved at runtime per project (see getTaskInProgressState), not hardcoded.
  state: string;
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
  // Optional: tasks may be created without a parent user story.
  parentStoryId?: number;
  tags: string[];
}

export interface CreateTaskResult {
  taskId: string;
  success: boolean;
  azureTaskId?: number;
  taskUrl?: string;
  stateTransitioned?: boolean;
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
