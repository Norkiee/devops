import React from 'react';
import { CreateTaskResult } from '../types';
import { Button } from '../components/Button';

interface SuccessScreenProps {
  results: CreateTaskResult[];
  storyTitle: string;
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
  storyTitle,
  tags,
  onViewInAzure,
  onCreateMore,
}: SuccessScreenProps): React.ReactElement {
  const successCount = results.filter((r) => r.success).length;

  return (
    <div className="screen screen-center">
      <div style={styles.icon}>&#10003;</div>
      <h2 style={styles.heading}>
        {successCount} task{successCount > 1 ? 's' : ''} created!
      </h2>
      <p style={styles.detail}>
        Story: {storyTitle}
        {tags.length > 0 && ` | Tags: ${tags.join(', ')}`}
      </p>

      <div className="screen-footer" style={styles.buttons}>
        <Button onClick={onViewInAzure} fullWidth>
          View in Azure DevOps
        </Button>
        <Button onClick={onCreateMore} variant="secondary" fullWidth>
          Create More Tasks
        </Button>
      </div>
    </div>
  );
}
