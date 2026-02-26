import { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { kvSet } from '../_lib/redis';

// Validate required environment variables
function getRequiredEnvVars(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  resourceId: string;
} {
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const redirectUri = process.env.AZURE_REDIRECT_URI;
  const resourceId = process.env.AZURE_DEVOPS_RESOURCE_ID;

  if (!clientId) throw new Error('Missing AZURE_CLIENT_ID');
  if (!clientSecret) throw new Error('Missing AZURE_CLIENT_SECRET');
  if (!redirectUri) throw new Error('Missing AZURE_REDIRECT_URI');
  if (!resourceId) throw new Error('Missing AZURE_DEVOPS_RESOURCE_ID');

  return { clientId, clientSecret, redirectUri, resourceId };
}

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

  let envVars: { clientId: string; clientSecret: string; redirectUri: string; resourceId: string };
  try {
    envVars = getRequiredEnvVars();
  } catch (error) {
    console.error('Environment variable error:', error);
    res.status(500).send('Server configuration error');
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
          client_id: envVars.clientId,
          client_secret: envVars.clientSecret,
          code,
          redirect_uri: envVars.redirectUri,
          grant_type: 'authorization_code',
          scope: `${envVars.resourceId}/.default offline_access`,
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
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication Successful</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        font-family: 'General Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%);
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .container {
        background: #ffffff;
        border-radius: 24px;
        padding: 48px;
        text-align: center;
        box-shadow: 0 4px 24px rgba(124, 58, 237, 0.1);
        max-width: 400px;
        width: 100%;
      }
      .checkmark-circle {
        width: 80px;
        height: 80px;
        background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 24px;
        animation: scaleIn 0.4s ease-out;
      }
      .checkmark {
        width: 36px;
        height: 36px;
        stroke: white;
        stroke-width: 3;
        fill: none;
        animation: drawCheck 0.5s ease-out 0.2s forwards;
        stroke-dasharray: 50;
        stroke-dashoffset: 50;
      }
      @keyframes scaleIn {
        0% { transform: scale(0); }
        50% { transform: scale(1.1); }
        100% { transform: scale(1); }
      }
      @keyframes drawCheck {
        to { stroke-dashoffset: 0; }
      }
      h1 {
        font-size: 24px;
        font-weight: 600;
        color: #1a1a1a;
        margin-bottom: 12px;
      }
      p {
        font-size: 15px;
        color: #666666;
        line-height: 1.5;
        margin-bottom: 32px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: #f3e8ff;
        color: #7c3aed;
        padding: 10px 20px;
        border-radius: 9999px;
        font-size: 14px;
        font-weight: 500;
      }
      .badge svg {
        width: 16px;
        height: 16px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="checkmark-circle">
        <svg class="checkmark" viewBox="0 0 36 36">
          <path d="M8 18L15 25L28 11" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <h1>Authentication Successful</h1>
      <p>You're connected to Azure DevOps. You can close this window and return to Figma.</p>
      <div class="badge">
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.7 5.7l-4 4a1 1 0 01-1.4 0l-2-2a1 1 0 111.4-1.4L7 8.6l3.3-3.3a1 1 0 111.4 1.4z"/>
        </svg>
        Connected to Azure DevOps
      </div>
    </div>
  </body>
</html>`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Authentication failed: ${message}`);
  }
}
