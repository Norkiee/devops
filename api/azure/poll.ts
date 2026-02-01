import { VercelRequest, VercelResponse } from '@vercel/node';
import { kvGet, kvDel } from '../_lib/redis';
import { handleCors } from '../_lib/auth';

interface AuthResult {
  sessionId: string;
  accessToken: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const state = req.query.state;
  if (!state || typeof state !== 'string') {
    res.status(400).json({ error: 'Missing state parameter' });
    return;
  }

  try {
    const result = await kvGet<AuthResult>(`auth:${state}`);

    if (!result) {
      res.status(200).json({ status: 'pending' });
      return;
    }

    // Delete the auth result after reading (one-time use)
    await kvDel(`auth:${state}`);

    res.status(200).json({
      status: 'complete',
      sessionId: result.sessionId,
      accessToken: result.accessToken,
    });
  } catch (err) {
    console.error('Poll error:', err);
    res.status(500).json({ error: 'Failed to check auth status' });
  }
}
