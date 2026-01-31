import React, { useEffect } from 'react';
import { Button } from '../components/Button';

interface HomeScreenProps {
  frameCount: number;
  onContinue: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  icon: {
    fontSize: '48px',
    color: '#999999',
    marginBottom: '8px',
  },
  heading: {
    fontSize: '20px',
    fontWeight: 600,
  },
  subtext: {
    fontSize: '12px',
    color: '#666666',
    maxWidth: '260px',
  },
};

export function HomeScreen({
  frameCount,
  onContinue,
}: HomeScreenProps): React.ReactElement {
  useEffect(() => {
    parent.postMessage(
      { pluginMessage: { type: 'get-selection' } },
      '*'
    );
  }, []);

  return (
    <div className="screen screen-center">
      <div style={styles.icon}>&#9638;</div>
      <h2 style={styles.heading}>Select frames to start</h2>
      <p style={styles.subtext}>
        Select one or more frames in Figma to generate Azure DevOps tasks
      </p>
      <div className="screen-footer" style={{ width: '100%' }}>
        <Button
          onClick={onContinue}
          disabled={frameCount === 0}
          fullWidth
        >
          {frameCount > 0
            ? `Continue with ${frameCount} frame${frameCount > 1 ? 's' : ''}`
            : 'Continue'}
        </Button>
      </div>
    </div>
  );
}
