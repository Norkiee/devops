import React from 'react';

interface TagProps {
  label: string;
  onRemove?: () => void;
  selected?: boolean;
  onClick?: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 500,
    background: '#e7f1ff',
    color: '#0d6efd',
    border: 'none',
    cursor: 'default',
    lineHeight: '1.6',
  },
  clickable: {
    cursor: 'pointer',
  },
  selected: {
    background: '#0d6efd',
    color: '#ffffff',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: '13px',
    lineHeight: '1',
    padding: '0',
    marginLeft: '2px',
    opacity: 0.7,
  },
};

export function Tag({
  label,
  onRemove,
  selected = false,
  onClick,
}: TagProps): React.ReactElement {
  return (
    <span
      style={{
        ...styles.tag,
        ...(selected ? styles.selected : {}),
        ...(onClick ? styles.clickable : {}),
      }}
      onClick={onClick}
    >
      {label}
      {onRemove && (
        <button
          style={styles.removeBtn}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          x
        </button>
      )}
    </span>
  );
}
