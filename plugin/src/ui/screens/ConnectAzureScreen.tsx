import React, { useState } from 'react';
import { Button } from '../components/Button';
import { fetchProjects, fetchWorkItemTypes } from '../services/api';

interface ConnectAzureScreenProps {
  isAuthenticated: boolean;
  // Pre-fills the URL field from the last connection (non-secret).
  savedUrl?: string;
  onConnect: (args: { pat: string; org: string; projectId?: string; url: string }) => void;
  onContinue: () => void;
  onDisconnect: () => void;
  onBack: () => void;
}

const PAT_DOCS_URL =
  'https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate';

// Parse an Azure DevOps URL into { org, project? }. Accepts:
//   https://dev.azure.com/{org}/{project}
//   https://{org}.visualstudio.com/{project}
// (project optional; trailing path segments like _git/_workitems are ignored).
function parseAzureDevOpsUrl(input: string): { org: string; project?: string } | null {
  const raw = input.trim();
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname
    .split('/')
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
  const cleanProject = (p?: string): string | undefined =>
    p && !p.startsWith('_') ? p : undefined;

  if (host === 'dev.azure.com') {
    return parts[0] ? { org: parts[0], project: cleanProject(parts[1]) } : null;
  }
  if (host.endsWith('.visualstudio.com')) {
    const org = host.split('.')[0];
    return org ? { org, project: cleanProject(parts[0]) } : null;
  }
  return null;
}

const styles: Record<string, React.CSSProperties> = {
  azureIcon: {
    width: '48px',
    height: '48px',
    margin: '0 auto 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0078d4',
    borderRadius: '12px',
    color: '#ffffff',
  },
  connectedBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    backgroundColor: '#E6FAF7',
    color: '#01786A',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 500,
    marginBottom: '8px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#666666',
    display: 'block',
    marginBottom: '4px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '13px',
    fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, sans-serif",
    border: '1px solid #E6ECF0',
    borderRadius: '8px',
    boxSizing: 'border-box',
    marginBottom: '12px',
  },
  help: {
    fontSize: '12px',
    color: '#666666',
    lineHeight: 1.5,
    marginBottom: '4px',
  },
  link: { color: '#01786A', textDecoration: 'underline' },
};

export function ConnectAzureScreen({
  isAuthenticated,
  savedUrl,
  onConnect,
  onContinue,
  onDisconnect,
  onBack,
}: ConnectAzureScreenProps): React.ReactElement {
  const [url, setUrl] = useState(savedUrl || '');
  const [pat, setPat] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (): Promise<void> => {
    const token = pat.trim();
    const parsed = parseAzureDevOpsUrl(url);
    if (!parsed) {
      setError('Enter a valid Azure DevOps URL, e.g. https://dev.azure.com/your-org/your-project');
      return;
    }
    if (!token || validating) return;

    setValidating(true);
    setError(null);
    try {
      // Validate the PAT against the org from the URL, and resolve the project id.
      const projects = await fetchProjects(token, parsed.org);
      let projectId: string | undefined;
      if (parsed.project) {
        const match = projects.find(
          (p) => p.name.toLowerCase() === parsed.project!.toLowerCase()
        );
        if (!match) {
          setError(`Project “${parsed.project}” wasn’t found in ${parsed.org}. Check the URL.`);
          setValidating(false);
          return;
        }
        projectId = match.id;
        // Listing projects needs only a basic scope; probe a Work Items endpoint
        // so a PAT that's missing the Work Items scope is caught here, not later.
        await fetchWorkItemTypes(token, parsed.org, projectId);
      }
      onConnect({ pat: token, org: parsed.org, projectId, url: url.trim() });
    } catch {
      setError(
        'Couldn’t connect. Check that the URL is right and your token is valid, not expired, and has the Work Items (read, write & manage) scope.'
      );
    } finally {
      setValidating(false);
    }
  };

  if (isAuthenticated) {
    return (
      <div className="screen screen-center">
        <div style={styles.azureIcon}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M13.05 4.24L6.56 18.05a.5.5 0 00.46.7h10.81a.5.5 0 00.44-.26l3.92-7.4a.5.5 0 00-.02-.5l-7.67-6.35a.5.5 0 00-.45 0z"
              fill="currentColor"
            />
          </svg>
        </div>
        <div style={styles.connectedBadge}>Connected</div>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
          Connected to Azure DevOps
        </h2>
        <p style={{ fontSize: '13px', color: '#666666', textAlign: 'center', maxWidth: '280px' }}>
          Continue to select a project and parent
        </p>
        <div className="screen-footer" style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            <Button onClick={onContinue} fullWidth>
              Continue
            </Button>
            <Button onClick={onDisconnect} variant="text" fullWidth>
              Disconnect
            </Button>
            <Button onClick={onBack} variant="text" fullWidth>
              Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen screen-center">
      <div style={styles.azureIcon}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M13.05 4.24L6.56 18.05a.5.5 0 00.46.7h10.81a.5.5 0 00.44-.26l3.92-7.4a.5.5 0 00-.02-.5l-7.67-6.35a.5.5 0 00-.45 0z"
            fill="currentColor"
          />
        </svg>
      </div>

      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
        Connect to Azure DevOps
      </h2>
      <p style={{ fontSize: '13px', color: '#666666', textAlign: 'center', maxWidth: '300px', marginBottom: '16px' }}>
        Enter your project URL and a personal access token.
      </p>

      <div style={{ width: '100%' }}>
        <label style={styles.label}>Project URL</label>
        <input
          style={styles.input}
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://dev.azure.com/your-org/your-project"
          aria-label="Azure DevOps project URL"
        />

        <label style={styles.label}>Personal access token</label>
        <input
          style={styles.input}
          type="password"
          value={pat}
          onChange={(e) => setPat(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSubmit();
          }}
          placeholder="Personal access token"
          aria-label="Azure DevOps personal access token"
        />

        <p style={styles.help}>
          Create a token in Azure DevOps → User settings → Personal access tokens, scoped to{' '}
          <strong>Work Items (read, write &amp; manage)</strong>. It’s kept only for this session.{' '}
          <a style={styles.link} href={PAT_DOCS_URL} target="_blank" rel="noopener noreferrer">
            How?
          </a>
        </p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="screen-footer" style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          <Button onClick={handleSubmit} fullWidth disabled={!url.trim() || !pat.trim() || validating}>
            {validating ? 'Verifying…' : 'Connect'}
          </Button>
          <Button onClick={onBack} variant="text" fullWidth>
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
