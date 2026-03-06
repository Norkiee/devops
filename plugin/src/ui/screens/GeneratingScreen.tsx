import React from 'react';
import { FrameData, WorkItemType } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';

interface GeneratingScreenProps {
  frames: FrameData[];
  workItemType?: WorkItemType;
  completedFrameIds: Set<string>;
}

const styles: Record<string, React.CSSProperties> = {
  frameList: {
    marginTop: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxWidth: '100%',
    padding: '0 16px',
  },
  frameItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#666666',
  },
  frameItemCompleted: {
    color: '#7c3aed',
  },
  frameName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  checkmark: {
    flexShrink: 0,
    width: '16px',
    height: '16px',
    color: '#7c3aed',
  },
  spinner: {
    flexShrink: 0,
    width: '16px',
    height: '16px',
    border: '2px solid #e0e0e0',
    borderTopColor: '#7c3aed',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  pending: {
    flexShrink: 0,
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    border: '2px solid #e0e0e0',
  },
};

export function GeneratingScreen({
  frames,
  workItemType = 'Task',
  completedFrameIds,
}: GeneratingScreenProps): React.ReactElement {
  const completedCount = completedFrameIds.size;
  const totalCount = frames.length;

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
        label={`Generating ${itemLabel}...`}
        sublabel={`Analyzing ${completedCount} of ${totalCount} frame${totalCount > 1 ? 's' : ''}`}
      />
      {frames.length > 1 && (
        <div style={styles.frameList}>
          {frames.map((frame) => {
            const isCompleted = completedFrameIds.has(frame.id);
            const isPending = !isCompleted && completedCount < totalCount;
            const isActive = !isCompleted && frames.findIndex(f => !completedFrameIds.has(f.id)) === frames.indexOf(frame);

            return (
              <div
                key={frame.id}
                style={{
                  ...styles.frameItem,
                  ...(isCompleted ? styles.frameItemCompleted : {}),
                }}
              >
                {isCompleted ? (
                  <svg style={styles.checkmark} viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8L6.5 11.5L13 4.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : isActive ? (
                  <div style={styles.spinner} />
                ) : (
                  <div style={styles.pending} />
                )}
                <span style={styles.frameName}>{frame.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
