import React from 'react';
import { Button } from '../components/Button';

interface TaskPreview {
  frameId: string;
  frameName: string;
  title: string;
  description: string;
}

interface ConnectAzureScreenProps {
  tasks: TaskPreview[];
  isAuthenticated: boolean;
  onConnect: () => void;
  onContinue: () => void;
}

export function ConnectAzureScreen({
  tasks,
  isAuthenticated,
  onConnect,
  onContinue,
}: ConnectAzureScreenProps): React.ReactElement {
  return (
    <div className="screen">
      <div className="screen-header">
        <div className="success-badge">{tasks.length} tasks ready</div>
        <h2>
          {isAuthenticated
            ? 'Connected to Azure DevOps'
            : 'Connect to Azure DevOps'}
        </h2>
        <p>
          {isAuthenticated
            ? 'Continue to assign tasks to a story'
            : 'Sign in to push tasks to your Azure DevOps board'}
        </p>
      </div>

      <div className="task-preview-list">
        {tasks.map((task, index) => (
          <div key={`${task.frameId}-${index}`} className="task-preview-item">
            <span className="task-preview-title">{task.title}</span>
            <span className="task-preview-frame">{task.frameName}</span>
          </div>
        ))}
      </div>

      <div className="screen-footer">
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
