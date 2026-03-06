import React from 'react';
import { WorkItemType } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';

interface WorkItemToSubmit {
  id: string;
  title: string;
}

interface SubmittingScreenProps {
  tasks: Array<{ taskId: string; title: string }> | WorkItemToSubmit[];
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
  const getItemLabel = (): string => {
    switch (workItemType) {
      case 'Epic': return 'epics';
      case 'Feature': return 'features';
      case 'UserStory': return 'user stories';
      case 'Task': return 'tasks';
      default: return 'work items';
    }
  };

  const itemLabel = getItemLabel();

  return (
    <div className="screen screen-center">
      <LoadingSpinner
        label={`Creating ${itemLabel}...`}
        sublabel="Pushing to Azure DevOps"
      />
      <div className="progress-list" style={{ marginTop: '16px' }}>
        {tasks.map((task) => {
          const id = 'taskId' in task ? task.taskId : task.id;
          return (
            <div key={id} style={styles.item}>
              <span style={styles.icon}>
                {completedTaskIds.has(id) ? (
                  <span className="success-icon">&#10003;</span>
                ) : (
                  '○'
                )}
              </span>
              <span>{task.title}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
