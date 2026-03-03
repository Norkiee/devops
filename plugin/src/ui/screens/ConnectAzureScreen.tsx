import React from 'react';
import { FrameTasks } from '../types';
import { Button } from '../components/Button';

interface ConnectAzureScreenProps {
  frameTasks?: FrameTasks[]; // Optional - may not have generated yet
  frameCount?: number;
  isAuthenticated: boolean;
  onTaskToggle?: (frameId: string, taskId: string) => void;
  onConnect: () => void;
  onContinue: () => void;
  onBack: () => void;
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
  badge: {
    display: 'inline-block',
    padding: '4px 12px',
    backgroundColor: '#f3e8ff',
    color: '#7c3aed',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 500,
    marginBottom: '8px',
  },
  connectedBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    backgroundColor: '#d4edda',
    color: '#198754',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 500,
    marginBottom: '8px',
  },
};

export function ConnectAzureScreen({
  frameTasks,
  frameCount,
  isAuthenticated,
  onTaskToggle,
  onConnect,
  onContinue,
  onBack,
}: ConnectAzureScreenProps): React.ReactElement {
  // Calculate counts if frameTasks provided
  const taskCount = frameTasks?.reduce((sum, ft) => sum + ft.tasks.length, 0) || 0;
  const displayCount = taskCount > 0 ? `${taskCount} work items ready` : `${frameCount || 0} frames ready`;

  return (
    <div className="screen screen-center">
      <div style={styles.azureIcon}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M13.05 4.24L6.56 18.05a.5.5 0 00.46.7h10.81a.5.5 0 00.44-.26l3.92-7.4a.5.5 0 00-.02-.5l-7.67-6.35a.5.5 0 00-.45 0z"
            fill="currentColor"
          />
          <path
            d="M10.95 4.24L4.46 18.05a.5.5 0 01-.46.7H2.73a.5.5 0 01-.44-.74l8.22-14.17a.5.5 0 01.87 0l.15.26a.5.5 0 01-.08.64l.5-.5z"
            fill="currentColor"
            opacity="0.6"
          />
        </svg>
      </div>

      <div style={isAuthenticated ? styles.connectedBadge : styles.badge}>
        {displayCount}
      </div>

      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
        {isAuthenticated
          ? 'Connected to Azure DevOps'
          : 'Connect to Azure DevOps'}
      </h2>
      <p style={{ fontSize: '13px', color: '#666666', textAlign: 'center', maxWidth: '280px' }}>
        {isAuthenticated
          ? 'Continue to select a parent work item'
          : 'Sign in to push work items to your Azure DevOps board'}
      </p>

      <div className="screen-footer" style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          {isAuthenticated ? (
            <>
              <Button onClick={onContinue} fullWidth>
                Continue
              </Button>
              <Button onClick={onConnect} fullWidth variant="secondary">
                Reconnect to Azure DevOps
              </Button>
            </>
          ) : (
            <Button onClick={onConnect} fullWidth>
              Connect Azure DevOps
            </Button>
          )}
          <Button onClick={onBack} variant="text" fullWidth>
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
