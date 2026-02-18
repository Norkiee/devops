import React from 'react';

interface LoadingSpinnerProps {
  label?: string;
  sublabel?: string;
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e0e0e0',
    borderTopColor: '#7c3aed',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  label: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#333333',
  },
  sublabel: {
    fontSize: '12px',
    color: '#666666',
  },
};

export function LoadingSpinner({
  label,
  sublabel,
}: LoadingSpinnerProps): React.ReactElement {
  return (
    <div style={styles.wrapper}>
      <style>
        {`@keyframes spin { to { transform: rotate(360deg); } }`}
      </style>
      <div style={styles.spinner} />
      {label && <div style={styles.label}>{label}</div>}
      {sublabel && <div style={styles.sublabel}>{sublabel}</div>}
    </div>
  );
}
