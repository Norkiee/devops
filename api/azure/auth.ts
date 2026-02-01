import { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/auth';

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

  const tenantId = process.env.AZURE_TENANT_ID || 'common';

  const params = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.AZURE_REDIRECT_URI!,
    scope: `${process.env.AZURE_DEVOPS_RESOURCE_ID}/.default offline_access`,
    state,
  });

  res.redirect(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`
  );
}
