import React from 'react';
import { CreateTaskResult, CreateUserStoryResult, WorkItemType } from '../types';
import { Button } from '../components/Button';

type SubmitResult = CreateTaskResult | CreateUserStoryResult;

interface PartialFailureScreenProps {
  results: SubmitResult[];
  workItemType?: WorkItemType;
  onRetry: () => void;
  onViewSuccessful: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  icon: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: '#fff3cd',
    color: '#856404',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    margin: '0 auto 12px',
  },
  heading: {
    fontSize: '20px',
    fontWeight: 600,
  },
  subtext: {
    fontSize: '12px',
    color: '#dc3545',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
  },
  itemIcon: {
    width: '16px',
    textAlign: 'center',
  },
  buttons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
  },
};

export function PartialFailureScreen({
  results,
  workItemType = 'Task',
  onRetry,
  onViewSuccessful,
}: PartialFailureScreenProps): React.ReactElement {
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const isUserStory = workItemType === 'UserStory';
  const itemLabel = isUserStory ? 'user story' : 'task';
  const itemLabelPlural = isUserStory ? 'user stories' : 'tasks';

  return (
    <div className="screen screen-center">
      <div style={styles.icon}>!</div>
      <h2 style={styles.heading}>
        {successCount} of {results.length} {results.length === 1 ? itemLabel : itemLabelPlural} created
      </h2>
      <p style={styles.subtext}>
        {failCount} {failCount === 1 ? itemLabel : itemLabelPlural} failed to create
      </p>

      <div className="progress-list" style={{ marginTop: '12px' }}>
        {results.map((result, index) => {
          const id = 'workItemId' in result ? result.workItemId : result.taskId;
          return (
            <div key={id || index} style={styles.item}>
              <span style={styles.itemIcon}>
                {result.success ? (
                  <span className="success-icon">&#10003;</span>
                ) : (
                  <span className="error-icon">&#10007;</span>
                )}
              </span>
              <span>
                Item {index + 1}
                {result.error && (
                  <span style={{ color: '#dc3545' }}> - {result.error}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div className="screen-footer" style={styles.buttons}>
        <Button onClick={onRetry} fullWidth>
          Retry Failed {isUserStory ? 'Stories' : 'Tasks'}
        </Button>
        {successCount > 0 && (
          <Button onClick={onViewSuccessful} variant="secondary" fullWidth>
            View Successful {isUserStory ? 'Stories' : 'Tasks'}
          </Button>
        )}
      </div>
    </div>
  );
}
