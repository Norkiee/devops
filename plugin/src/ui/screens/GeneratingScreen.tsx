import React from 'react';
import { FrameData } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';

interface GeneratingScreenProps {
  frames: FrameData[];
  completedFrameIds: Set<string>;
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

export function GeneratingScreen({
  frames,
  completedFrameIds,
}: GeneratingScreenProps): React.ReactElement {
  return (
    <div className="screen screen-center">
      <LoadingSpinner
        label="Generating tasks..."
        sublabel={`Analyzing ${frames.length} frame${frames.length > 1 ? 's' : ''}`}
      />
      <div className="progress-list" style={{ marginTop: '16px' }}>
        {frames.map((frame) => (
          <div key={frame.id} style={styles.item}>
            <span style={styles.icon}>
              {completedFrameIds.has(frame.id) ? (
                <span className="success-icon">✓</span>
              ) : (
                <span>○</span>
              )}
            </span>
            <span>{frame.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
