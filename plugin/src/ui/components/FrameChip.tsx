import React from 'react';

interface FrameChipProps {
  name: string;
}

const style: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 500,
  background: '#f5f5f5',
  color: '#666666',
  border: '1px solid #e0e0e0',
};

export function FrameChip({ name }: FrameChipProps): React.ReactElement {
  return <span style={style}>{name}</span>;
}
