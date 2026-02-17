import { VercelRequest, VercelResponse } from '@vercel/node';
import { generateTasksForFrame } from './_lib/claude';
import { FrameData, FrameTasks } from './_lib/types';
import { handleCors } from './_lib/auth';

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
    const { frames, context } = req.body as {
      frames: FrameData[];
      context?: string;
    };

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      res.status(400).json({ error: 'No frames provided' });
      return;
    }

    if (frames.length > 20) {
      res.status(400).json({ error: 'Maximum 20 frames per request' });
      return;
    }

    const frameTasks: FrameTasks[] = await Promise.all(
      frames.map((frame) => generateTasksForFrame(frame, context))
    );

    res.status(200).json({ frameTasks });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: 'Failed to generate tasks' });
  }
}
