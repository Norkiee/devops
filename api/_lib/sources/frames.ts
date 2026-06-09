import { FrameData, HierarchyContext, WorkItemType } from '../types';
import { GenerationInput, GenerationUnit } from './types';

// The content payload a figma-frames unit carries. The frame prompt builders in
// claude.ts read these fields off `GenerationUnit.content`.
export interface FrameContent {
  sectionName?: string;
  textContent: string[];
  componentNames: string[];
  nestedFrameNames: string[];
  width: number;
  height: number;
}

// Adapter A — figma-frames. Normalizes a single FrameData into a GenerationUnit.
// `flowKey` is the durable identity (section/frame name within the file), NOT the
// volatile Figma node-id — keep this stable so snapshots and feedback don't orphan.
export function frameToUnit(frame: FrameData): GenerationUnit {
  return {
    refId: frame.id,
    refName: frame.name,
    flowKey: frame.sectionName || frame.name,
    content: {
      sectionName: frame.sectionName,
      textContent: frame.textContent,
      componentNames: frame.componentNames,
      nestedFrameNames: frame.nestedFrameNames,
      width: frame.width,
      height: frame.height,
    } satisfies FrameContent,
  };
}

// Builds the normalized GenerationInput the generator consumes from raw frames.
// This is the figma-frames path expressed as an adapter — same behavior as before.
export function framesToGenerationInput(
  frames: FrameData[],
  workItemType: WorkItemType,
  context?: string,
  hierarchyContext?: HierarchyContext
): GenerationInput {
  return {
    sourceType: 'figma_frames',
    workItemType,
    context,
    hierarchyContext,
    units: frames.map(frameToUnit),
  };
}
