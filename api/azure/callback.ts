import { VercelRequest, VercelResponse } from '@vercel/node';
import { kvSet } from '../_lib/redis';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error('OAuth error:', error, error_description);
    res.status(400).send(`Authentication failed: ${error_description}`);
    return;
  }

  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'No code provided' });
    return;
  }

  if (!state || typeof state !== 'string') {
    res.status(400).json({ error: 'No state provided' });
    return;
  }

  try {
    const tenantId = process.env.AZURE_TENANT_ID || 'common';

    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.AZURE_CLIENT_ID!,
          client_secret: process.env.AZURE_CLIENT_SECRET!,
          code,
          redirect_uri: process.env.AZURE_REDIRECT_URI!,
          grant_type: 'authorization_code',
          scope: `${process.env.AZURE_DEVOPS_RESOURCE_ID}/.default offline_access`,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      res.status(500).send(`Token exchange failed: ${errorData}`);
      return;
    }

    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const { randomUUID } = await import('crypto');
    const sessionId = randomUUID();

    // Store refresh token for long-term session
    await kvSet(
      `session:${sessionId}`,
      {
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      },
      60 * 60 * 24 * 30
    );

    // Store auth result keyed by state so the plugin can poll for it
    await kvSet(
      `auth:${state}`,
      {
        sessionId,
        accessToken: tokens.access_token,
      },
      60 * 5 // expires in 5 minutes
    );

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html>
  <body>
    <p>Authentication successful! You can close this window and return to Figma.</p>
  </body>
</html>`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Authentication failed: ${message}`);
  }
}
