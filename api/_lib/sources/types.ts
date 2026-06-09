import { WorkItemType, HierarchyContext } from '../types';

// Every input source normalizes into the same shape the generator consumes.
// Adapters only produce normalized units — they never fork the generate or push path.
export type SourceType =
  | 'figma_frames'
  | 'design_delta'
  | 'readme'
  | 'resolved_comment';

export interface GenerationUnit {
  refId: string; // frame id, comment id, doc section
  refName: string;
  flowKey?: string; // durable flow key when applicable
  content: unknown; // free-form per source; the source's prompt builder narrows it
}

export interface GenerationInput {
  sourceType: SourceType;
  workItemType: WorkItemType;
  context?: string;
  hierarchyContext?: HierarchyContext;
  units: GenerationUnit[];
}
