import React, { useState } from 'react';
import { FrameTasks } from '../types';
import { Button } from '../components/Button';

interface ConnectAzureScreenProps {
  frameTasks: FrameTasks[];
  isAuthenticated: boolean;
  onTaskToggle: (frameId: string, taskId: string) => void;
  onConnect: () => void;
  onContinue: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  frameGroup: {
    marginBottom: '8px',
  },
  frameHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '6px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  frameHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  chevron: {
    fontSize: '12px',
    color: '#666666',
    transition: 'transform 0.2s',
  },
  frameName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#333333',
  },
  taskCount: {
    fontSize: '11px',
    color: '#666666',
    backgroundColor: '#e0e0e0',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  taskList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    marginTop: '6px',
    paddingLeft: '8px',
  },
  taskItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: '#ffffff',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
  },
  taskItemDeselected: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: '#f9f9f9',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    opacity: 0.5,
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  taskTitle: {
    fontSize: '12px',
    color: '#333333',
    flex: 1,
  },
  successBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    backgroundColor: '#d4edda',
    color: '#198754',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 500,
    marginBottom: '8px',
  },
  footerStats: {
    fontSize: '12px',
    color: '#666666',
    textAlign: 'center' as const,
    marginBottom: '8px',
  },
};

export function ConnectAzureScreen({
  frameTasks,
  isAuthenticated,
  onTaskToggle,
  onConnect,
  onContinue,
}: ConnectAzureScreenProps): React.ReactElement {
  const [expandedFrames, setExpandedFrames] = useState<Set<string>>(
    new Set(frameTasks.map((ft) => ft.frameId))
  );

  const toggleFrame = (frameId: string) => {
    setExpandedFrames((prev) => {
      const next = new Set(prev);
      if (next.has(frameId)) {
        next.delete(frameId);
      } else {
        next.add(frameId);
      }
      return next;
    });
  };

  const totalTasks = frameTasks.reduce((sum, ft) => sum + ft.tasks.length, 0);
  const selectedCount = frameTasks.reduce(
    (sum, ft) => sum + ft.tasks.filter((t) => t.selected).length,
    0
  );

  return (
    <div className="screen">
      <div className="screen-header">
        <div style={styles.successBadge}>{selectedCount} tasks ready</div>
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

      <div className="task-list">
        {frameTasks.map((frameTask) => {
          const isExpanded = expandedFrames.has(frameTask.frameId);
          const frameSelectedCount = frameTask.tasks.filter((t) => t.selected).length;

          return (
            <div key={frameTask.frameId} style={styles.frameGroup}>
              <div
                style={styles.frameHeader}
                onClick={() => toggleFrame(frameTask.frameId)}
              >
                <div style={styles.frameHeaderLeft}>
                  <span
                    style={{
                      ...styles.chevron,
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}
                  >
                    ▶
                  </span>
                  <span style={styles.frameName}>{frameTask.frameName}</span>
                </div>
                <span style={styles.taskCount}>
                  {frameSelectedCount}/{frameTask.tasks.length}
                </span>
              </div>

              {isExpanded && (
                <div style={styles.taskList}>
                  {frameTask.tasks.map((task) => (
                    <div
                      key={task.id}
                      style={task.selected ? styles.taskItem : styles.taskItemDeselected}
                    >
                      <input
                        type="checkbox"
                        checked={task.selected}
                        onChange={() => onTaskToggle(frameTask.frameId, task.id)}
                        style={styles.checkbox}
                      />
                      <span style={styles.taskTitle}>{task.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="screen-footer">
        <div style={styles.footerStats}>
          {selectedCount} of {totalTasks} tasks selected
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Button onClick={onConnect} fullWidth disabled={selectedCount === 0}>
            {isAuthenticated ? 'Reconnect to Azure DevOps' : 'Connect Azure DevOps'}
          </Button>
          {isAuthenticated && (
            <Button onClick={onContinue} fullWidth disabled={selectedCount === 0} variant="secondary">
              Continue with existing session
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
