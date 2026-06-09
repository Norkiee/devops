import { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/auth';
import {
  safeMemory,
  recordFeedback,
  FeedbackUpdate,
  FeedbackStatus,
  FEEDBACK_STATUSES,
} from './_lib/db';

const MAX_ITEMS = 500;
const MAX_FEEDBACK_LENGTH = 2000;

// POST /api/feedback
// Records what happened to previously-proposed items after a submit pass.
// Best-effort: invalid/partial input is filtered out and storage failures never
// surface as errors — the plugin should never break because memory hiccuped.
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body as { items?: unknown };

  if (!body.items || !Array.isArray(body.items)) {
    res.status(400).json({ error: 'items must be an array' });
    return;
  }

  const updates: FeedbackUpdate[] = [];
  for (const raw of body.items.slice(0, MAX_ITEMS)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;

    if (typeof item.workItemId !== 'string' || !item.workItemId) continue;
    if (
      typeof item.status !== 'string' ||
      !(FEEDBACK_STATUSES as readonly string[]).includes(item.status)
    ) {
      continue;
    }

    const update: FeedbackUpdate = {
      sourceRef: item.workItemId,
      status: item.status as FeedbackStatus,
    };
    if (typeof item.azureId === 'number') update.azureId = item.azureId;
    if (typeof item.feedback === 'string') {
      update.feedback = item.feedback.slice(0, MAX_FEEDBACK_LENGTH);
    }
    updates.push(update);
  }

  const recorded = await safeMemory(
    'record-feedback',
    async () => {
      await recordFeedback(updates);
      return updates.length;
    },
    0
  );

  res.status(200).json({ ok: true, recorded });
}
