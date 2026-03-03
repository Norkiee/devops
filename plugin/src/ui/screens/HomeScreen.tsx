import React, { useEffect } from 'react';
import { Button } from '../components/Button';

interface HomeScreenProps {
  frameCount: number;
  sectionCount?: number;
  onContinue: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  iconGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px',
    marginBottom: '12px',
  },
  iconSquare: {
    width: '22px',
    height: '22px',
    borderRadius: '5px',
    border: '2.5px solid #1a1a2e',
  },
  heading: {
    fontSize: '20px',
    fontWeight: 700,
  },
  subtext: {
    fontSize: '13px',
    color: '#999999',
    maxWidth: '260px',
    lineHeight: '1.5',
  },
};

export function HomeScreen({
  frameCount,
  sectionCount = 0,
  onContinue,
}: HomeScreenProps): React.ReactElement {
  useEffect(() => {
    parent.postMessage(
      { pluginMessage: { type: 'get-selection' } },
      '*'
    );
  }, []);

  const getButtonText = () => {
    if (sectionCount > 0) {
      return `Continue with ${sectionCount} section${sectionCount > 1 ? 's' : ''} (${frameCount} frame${frameCount > 1 ? 's' : ''})`;
    }
    return `Continue with ${frameCount} frame${frameCount > 1 ? 's' : ''}`;
  };

  return (
    <div className="screen" style={{ alignItems: 'center', textAlign: 'center' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        <div style={styles.iconGrid}>
          <div style={styles.iconSquare} />
          <div style={styles.iconSquare} />
          <div style={styles.iconSquare} />
          <div style={styles.iconSquare} />
        </div>
        <h2 style={styles.heading}>Select frames or sections</h2>
        <p style={styles.subtext}>
          Select frames or sections in Figma to generate Azure DevOps work items
        </p>
      </div>
      {frameCount > 0 && (
        <div style={{ width: '100%' }}>
          <Button onClick={onContinue} fullWidth>
            {getButtonText()}
          </Button>
        </div>
      )}
    </div>
  );
}
