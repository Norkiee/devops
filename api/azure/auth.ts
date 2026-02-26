import { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/auth';

// Validate required environment variables
function getRequiredEnvVars(): { clientId: string; redirectUri: string; resourceId: string } {
  const clientId = process.env.AZURE_CLIENT_ID;
  const redirectUri = process.env.AZURE_REDIRECT_URI;
  const resourceId = process.env.AZURE_DEVOPS_RESOURCE_ID;

  if (!clientId) throw new Error('Missing AZURE_CLIENT_ID environment variable');
  if (!redirectUri) throw new Error('Missing AZURE_REDIRECT_URI environment variable');
  if (!resourceId) throw new Error('Missing AZURE_DEVOPS_RESOURCE_ID environment variable');

  return { clientId, redirectUri, resourceId };
}

export default function handler(
  req: VercelRequest,
  res: VercelResponse
): void {
  if (handleCors(req, res)) return;

  const state = req.query.state;
  if (!state || typeof state !== 'string') {
    res.status(400).json({ error: 'Missing state parameter' });
    return;
  }

  let envVars: { clientId: string; redirectUri: string; resourceId: string };
  try {
    envVars = getRequiredEnvVars();
  } catch (error) {
    console.error('Environment variable error:', error);
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  const tenantId = process.env.AZURE_TENANT_ID || 'common';

  const params = new URLSearchParams({
    client_id: envVars.clientId,
    response_type: 'code',
    redirect_uri: envVars.redirectUri,
    scope: `${envVars.resourceId}/.default offline_access`,
    state,
  });

  res.redirect(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`
  );
}
