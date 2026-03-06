import { VercelRequest, VercelResponse } from '@vercel/node';
import { generateWorkItemsForFrame } from './_lib/claude';
import { FrameData, FrameWorkItems, WorkItemType, HierarchyContext } from './_lib/types';
import { handleCors } from './_lib/auth';

// Validation limits
const MAX_FRAMES = 20;
const MAX_TEXT_CONTENT_ITEMS = 50;
const MAX_TEXT_CONTENT_LENGTH = 500;
const MAX_COMPONENT_NAMES = 30;
const MAX_NESTED_FRAME_NAMES = 20;
const MAX_CONTEXT_LENGTH = 2000;
const MAX_FRAME_NAME_LENGTH = 200;

function validateFrameData(frame: unknown, index: number): FrameData {
  if (!frame || typeof frame !== 'object') {
    throw new Error(`Frame ${index}: Invalid frame data`);
  }

  const f = frame as Record<string, unknown>;

  // Validate required fields
  if (typeof f.id !== 'string' || !f.id) {
    throw new Error(`Frame ${index}: Missing or invalid id`);
  }
  if (typeof f.name !== 'string' || !f.name) {
    throw new Error(`Frame ${index}: Missing or invalid name`);
  }
  if (typeof f.width !== 'number' || f.width <= 0) {
    throw new Error(`Frame ${index}: Invalid width`);
  }
  if (typeof f.height !== 'number' || f.height <= 0) {
    throw new Error(`Frame ${index}: Invalid height`);
  }

  // Truncate frame name if too long
  const name = f.name.slice(0, MAX_FRAME_NAME_LENGTH);

  // Validate and sanitize arrays
  let textContent: string[] = [];
  if (Array.isArray(f.textContent)) {
    textContent = f.textContent
      .filter((item): item is string => typeof item === 'string' && item.length > 0)
      .slice(0, MAX_TEXT_CONTENT_ITEMS)
      .map(text => text.slice(0, MAX_TEXT_CONTENT_LENGTH));
  }

  let componentNames: string[] = [];
  if (Array.isArray(f.componentNames)) {
    componentNames = f.componentNames
      .filter((item): item is string => typeof item === 'string' && item.length > 0)
      .slice(0, MAX_COMPONENT_NAMES);
  }

  let nestedFrameNames: string[] = [];
  if (Array.isArray(f.nestedFrameNames)) {
    nestedFrameNames = f.nestedFrameNames
      .filter((item): item is string => typeof item === 'string' && item.length > 0)
      .slice(0, MAX_NESTED_FRAME_NAMES);
  }

  // Validate optional sectionName
  let sectionName: string | undefined;
  if (f.sectionName !== undefined) {
    if (typeof f.sectionName !== 'string') {
      throw new Error(`Frame ${index}: sectionName must be a string`);
    }
    sectionName = f.sectionName.slice(0, MAX_FRAME_NAME_LENGTH);
  }

  return {
    id: f.id,
    name,
    sectionName,
    textContent,
    componentNames,
    nestedFrameNames,
    width: Math.round(f.width),
    height: Math.round(f.height),
  };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body as {
      frames?: unknown;
      context?: unknown;
      workItemType?: unknown;
      hierarchyContext?: unknown;
    };

    if (!body.frames || !Array.isArray(body.frames) || body.frames.length === 0) {
      res.status(400).json({ error: 'No frames provided' });
      return;
    }

    if (body.frames.length > MAX_FRAMES) {
      res.status(400).json({ error: `Maximum ${MAX_FRAMES} frames per request` });
      return;
    }

    // Validate and sanitize each frame
    const frames: FrameData[] = body.frames.map((frame, index) =>
      validateFrameData(frame, index)
    );

    // Validate context if provided
    let context: string | undefined;
    if (body.context !== undefined) {
      if (typeof body.context !== 'string') {
        res.status(400).json({ error: 'Context must be a string' });
        return;
      }
      context = body.context.slice(0, MAX_CONTEXT_LENGTH);
    }

    // Validate workItemType - default to 'Task' for backwards compatibility
    let workItemType: WorkItemType = 'Task';
    if (body.workItemType !== undefined) {
      const validTypes: WorkItemType[] = ['Epic', 'Feature', 'UserStory', 'Task'];
      if (!validTypes.includes(body.workItemType as WorkItemType)) {
        res.status(400).json({ error: 'workItemType must be "Epic", "Feature", "UserStory", or "Task"' });
        return;
      }
      workItemType = body.workItemType as WorkItemType;
    }

    // Validate hierarchyContext if provided
    let hierarchyContext: HierarchyContext | undefined;
    if (body.hierarchyContext !== undefined) {
      if (typeof body.hierarchyContext !== 'object' || body.hierarchyContext === null) {
        res.status(400).json({ error: 'hierarchyContext must be an object' });
        return;
      }
      hierarchyContext = body.hierarchyContext as HierarchyContext;
    }

    const frameWorkItems: FrameWorkItems[] = await Promise.all(
      frames.map((frame) =>
        generateWorkItemsForFrame(frame, workItemType, context, hierarchyContext)
      )
    );

    // Return response with backwards-compatible frameTasks alias
    res.status(200).json({
      workItemType,
      frameWorkItems,
      // Backwards compatibility: provide frameTasks with tasks property
      frameTasks: frameWorkItems.map((fwi) => ({
        ...fwi,
        tasks: fwi.workItems,
      })),
    });
  } catch (error) {
    console.error('Generate error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Return 400 for validation errors, 500 for other errors
    if (message.startsWith('Frame ')) {
      res.status(400).json({ error: message });
    } else {
      res.status(500).json({ error: `Failed to generate tasks: ${message}` });
    }
  }
}
