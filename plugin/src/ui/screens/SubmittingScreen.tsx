import React from 'react';
import { TaskToSubmit } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';

interface SubmittingScreenProps {
  tasks: TaskToSubmit[];
  completedIndices: Set<number>;
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
  completedIndices,
}: SubmittingScreenProps): React.ReactElement {
  return (
    <div className="screen screen-center">
      <LoadingSpinner
        label="Creating tasks..."
        sublabel="Pushing to Azure DevOps"
      />
      <div className="progress-list" style={{ marginTop: '16px' }}>
        {tasks.map((task, index) => (
          <div key={task.frameId} style={styles.item}>
            <span style={styles.icon}>
              {completedIndices.has(index) ? (
                <span className="success-icon">&#10003;</span>
              ) : (
                '&#9675;'
              )}
            </span>
            <span>{task.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
