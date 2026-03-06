import React from 'react';
import { CreateTaskResult, CreateUserStoryResult, CreateEpicResult, CreateFeatureResult, WorkItemType } from '../types';
import { Button } from '../components/Button';

type SubmitResult = CreateTaskResult | CreateUserStoryResult | CreateEpicResult | CreateFeatureResult;

interface SuccessScreenProps {
  results: SubmitResult[];
  workItemType?: WorkItemType;
  parentTitle: string;
  tags: string[];
  onViewInAzure: () => void;
  onCreateMore: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  icon: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: '#d4edda',
    color: '#198754',
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
  detail: {
    fontSize: '12px',
    color: '#666666',
  },
  buttons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
  },
};

export function SuccessScreen({
  results,
  workItemType = 'Task',
  parentTitle,
  tags,
  onViewInAzure,
  onCreateMore,
}: SuccessScreenProps): React.ReactElement {
  const successCount = results.filter((r) => r.success).length;

  const getLabels = (): { singular: string; plural: string; parent: string; button: string } => {
    switch (workItemType) {
      case 'Epic':
        return { singular: 'epic', plural: 'epics', parent: 'Project', button: 'Epics' };
      case 'Feature':
        return { singular: 'feature', plural: 'features', parent: 'Epic', button: 'Features' };
      case 'UserStory':
        return { singular: 'user story', plural: 'user stories', parent: 'Parent', button: 'Stories' };
      case 'Task':
      default:
        return { singular: 'task', plural: 'tasks', parent: 'Story', button: 'Tasks' };
    }
  };

  const { singular, plural, parent, button } = getLabels();

  return (
    <div className="screen screen-center">
      <div style={styles.icon}>&#10003;</div>
      <h2 style={styles.heading}>
        {successCount} {successCount === 1 ? singular : plural} created!
      </h2>
      {parentTitle && (
        <p style={styles.detail}>
          {parent}: {parentTitle}
          {tags.length > 0 && ` | Tags: ${tags.join(', ')}`}
        </p>
      )}
      {!parentTitle && tags.length > 0 && (
        <p style={styles.detail}>Tags: {tags.join(', ')}</p>
      )}

      <div className="screen-footer" style={styles.buttons}>
        <Button onClick={onViewInAzure} fullWidth>
          View in Azure DevOps
        </Button>
        <Button onClick={onCreateMore} variant="secondary" fullWidth>
          Create More {button}
        </Button>
      </div>
    </div>
  );
}
