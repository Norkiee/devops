import React from 'react';
import { GeneratedTask } from '../types';
import { Button } from '../components/Button';

interface ConnectAzureScreenProps {
  tasks: GeneratedTask[];
  isAuthenticated: boolean;
  onConnect: () => void;
  onContinue: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  badge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
    background: '#d4edda',
    color: '#198754',
    marginBottom: '8px',
  },
  icon: {
    fontSize: '40px',
    marginBottom: '8px',
  },
};

export function ConnectAzureScreen({
  tasks,
  isAuthenticated,
  onConnect,
  onContinue,
}: ConnectAzureScreenProps): React.ReactElement {
  return (
    <div className="screen screen-center">
      <div style={styles.icon}>&#9729;</div>
      <div style={styles.badge}>
        {tasks.length} task{tasks.length > 1 ? 's' : ''} ready
      </div>
      <h2 style={{ fontSize: '20px', fontWeight: 600 }}>
        {isAuthenticated
          ? 'Connected to Azure DevOps'
          : 'Connect to Azure DevOps'}
      </h2>
      <p style={{ fontSize: '12px', color: '#666666' }}>
        {isAuthenticated
          ? 'Continue to assign tasks to a story'
          : 'Sign in to push tasks to your Azure DevOps board'}
      </p>

      <div className="task-preview-list">
        {tasks.map((task) => (
          <div key={task.frameId} className="task-preview-item">
            {task.title}
          </div>
        ))}
      </div>

      <div className="screen-footer" style={{ width: '100%' }}>
        {isAuthenticated ? (
          <Button onClick={onContinue} fullWidth>
            Continue
          </Button>
        ) : (
          <Button onClick={onConnect} fullWidth>
            Connect Azure DevOps
          </Button>
        )}
      </div>
    </div>
  );
}
