import { VercelRequest, VercelResponse } from '@vercel/node';
import { kvGet, kvSet, kvDel } from '../_lib/redis';
import { KVSession } from '../_lib/types';
import { handleCors } from '../_lib/auth';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { sessionId } = req.body as { sessionId?: string };

  if (!sessionId) {
    res.status(400).json({ error: 'No session ID provided' });
    return;
  }

  try {
    const session = await kvGet<KVSession>(`session:${sessionId}`);

    if (!session?.refreshToken) {
      res
        .status(401)
        .json({ error: 'Session expired, please re-authenticate' });
      return;
    }

    const tenantId = process.env.AZURE_TENANT_ID || 'common';

    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.AZURE_CLIENT_ID!,
          client_secret: process.env.AZURE_CLIENT_SECRET!,
          refresh_token: session.refreshToken,
          grant_type: 'refresh_token',
          scope: `${process.env.AZURE_DEVOPS_RESOURCE_ID}/.default offline_access`,
        }),
      }
    );

    if (!tokenResponse.ok) {
      await kvDel(`session:${sessionId}`);
      res
        .status(401)
        .json({ error: 'Refresh failed, please re-authenticate' });
      return;
    }

    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    await kvSet(
      `session:${sessionId}`,
      {
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      },
      60 * 60 * 24 * 30
    );

    res.status(200).json({ accessToken: tokens.access_token });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
}
