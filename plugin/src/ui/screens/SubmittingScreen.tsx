import React from 'react';
import { TaskToSubmit, WorkItemType } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';

interface SubmittingScreenProps {
  tasks: TaskToSubmit[];
  workItemType?: WorkItemType;
  completedTaskIds: Set<string>;
}

const styles: Record<string, React.CSSProperties> = {
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
  },
  icon: {
    width: '16px',
    textAlign: 'center',
  },
};

export function SubmittingScreen({
  tasks,
  workItemType = 'Task',
  completedTaskIds,
}: SubmittingScreenProps): React.ReactElement {
  const itemLabel = workItemType === 'UserStory' ? 'user stories' : 'tasks';

  return (
    <div className="screen screen-center">
      <LoadingSpinner
        label={`Creating ${itemLabel}...`}
        sublabel="Pushing to Azure DevOps"
      />
      <div className="progress-list" style={{ marginTop: '16px' }}>
        {tasks.map((task) => (
          <div key={task.taskId} style={styles.item}>
            <span style={styles.icon}>
              {completedTaskIds.has(task.taskId) ? (
                <span className="success-icon">&#10003;</span>
              ) : (
                '○'
              )}
            </span>
            <span>{task.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
