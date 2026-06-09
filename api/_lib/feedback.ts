import { VercelRequest, VercelResponse } from '@vercel/node';
import {
  safeMemory,
  recordFeedback,
  FeedbackUpdate,
  FeedbackStatus,
  FEEDBACK_STATUSES,
} from './db';

const MAX_ITEMS = 500;
const MAX_FEEDBACK_LENGTH = 2000;

// Records what happened to previously-proposed items after a submit pass.
// Best-effort: invalid/partial input is filtered out and storage failures never
// surface as errors — the plugin should never break because memory hiccuped.
//
// Reached via POST /api/feedback, which vercel.json rewrites to
// /api/generate?action=feedback so both memory writes share one serverless
// function (Hobby plan caps deployments at 12 functions). CORS is already
// handled by the generate handler before this runs.
export async function handleFeedback(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
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
