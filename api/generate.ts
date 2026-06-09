import { VercelRequest, VercelResponse } from '@vercel/node';
import { generateWorkItemsForUnit } from './_lib/claude';
import { framesToGenerationInput } from './_lib/sources/frames';
import { FrameData, FrameWorkItems, WorkItemType, HierarchyContext } from './_lib/types';
import { handleCors } from './_lib/auth';
import { handleFeedback } from './_lib/feedback';
import {
  safeMemory,
  getOrCreateFlows,
  loadPriorItems,
  insertGeneratedItems,
  GeneratedItemRow,
  PriorItem,
} from './_lib/db';

// Validation limits
const MAX_FRAMES = 20;
const MAX_TEXT_CONTENT_ITEMS = 50;
const MAX_TEXT_CONTENT_LENGTH = 500;
const MAX_COMPONENT_NAMES = 30;
const MAX_NESTED_FRAME_NAMES = 20;
const MAX_CONTEXT_LENGTH = 2000;
const MAX_FRAME_NAME_LENGTH = 200;
const MAX_FILE_KEY_LENGTH = 200;

// Turns prior generated items into a prompt addendum so Claude avoids repeating
// past work and steers clear of previously-rejected items.
function buildMemoryContext(prior: PriorItem[]): string {
  if (prior.length === 0) return '';

  const rejected = prior.filter((p) => p.status === 'rejected');
  const others = prior.filter((p) => p.status !== 'rejected');
  const lines: string[] = [];

  if (others.length > 0) {
    lines.push('Previously generated work items for this flow (do NOT repeat these):');
    for (const p of others.slice(0, 50)) lines.push(`- ${p.title}`);
  }

  if (rejected.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('Previously REJECTED items (avoid these and anything similar):');
    for (const p of rejected.slice(0, 50)) {
      lines.push(`- ${p.title}${p.feedback ? ` (reason: ${p.feedback})` : ''}`);
    }
  }

  return lines.join('\n');
}

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

  // /api/feedback is rewritten here as ?action=feedback so both memory-write
  // endpoints share one serverless function (Hobby plan: 12-function cap).
  if (req.query.action === 'feedback') {
    await handleFeedback(req, res);
    return;
  }

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
      fileKey?: unknown;
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

    // Optional fileKey enables the memory layer. Absent (older plugin) → memory
    // is skipped entirely and generation behaves exactly as before.
    let fileKey: string | undefined;
    if (body.fileKey !== undefined && typeof body.fileKey === 'string' && body.fileKey) {
      fileKey = body.fileKey.slice(0, MAX_FILE_KEY_LENGTH);
    }

    // Adapter A — normalize frames into the generation input the core consumes.
    // The frames path is now just one source feeding the shared generator.
    const input = framesToGenerationInput(
      frames,
      workItemType,
      context,
      hierarchyContext
    );

    // Memory (best-effort): resolve flows for this file and load prior items so
    // the prompt can avoid duplicates and respect past rejections.
    let flowIdByKey = new Map<string, string>();
    let effectiveContext = context;
    if (fileKey) {
      const key = fileKey;
      flowIdByKey = await safeMemory(
        'resolve-flows+prior',
        async () => {
          const flowKeys = input.units
            .map((u) => u.flowKey)
            .filter((k): k is string => Boolean(k));
          const idByKey = await getOrCreateFlows(key, flowKeys);
          const prior = await loadPriorItems([...idByKey.values()]);
          const memoryContext = buildMemoryContext(prior);
          if (memoryContext) {
            effectiveContext = context
              ? `${context}\n\n${memoryContext}`
              : memoryContext;
          }
          return idByKey;
        },
        flowIdByKey
      );
    }

    const frameWorkItems: FrameWorkItems[] = await Promise.all(
      input.units.map((unit) =>
        generateWorkItemsForUnit(
          unit,
          input.workItemType,
          effectiveContext,
          input.hierarchyContext
        )
      )
    );

    // Memory (best-effort): persist proposed items, correlated to their flow.
    // source_ref = the plugin's WorkItem.id so a later submit can update status.
    if (fileKey) {
      await safeMemory(
        'insert-generated-items',
        async () => {
          const rows: GeneratedItemRow[] = [];
          frameWorkItems.forEach((fwi, i) => {
            const unit = input.units[i];
            const flowId = unit?.flowKey
              ? flowIdByKey.get(unit.flowKey) ?? null
              : null;
            for (const wi of fwi.workItems) {
              rows.push({
                flowId,
                sourceType: input.sourceType,
                workItemType,
                title: wi.title,
                description: wi.description,
                sourceRef: wi.id,
              });
            }
          });
          await insertGeneratedItems(rows);
        },
        undefined
      );
    }

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
