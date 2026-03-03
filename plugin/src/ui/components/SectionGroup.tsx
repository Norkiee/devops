import React, { useState } from 'react';

interface SectionGroupProps {
  sectionName: string;
  frameCount: number;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: '12px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    backgroundColor: '#f0e6ff',
    borderRadius: '8px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  folderIcon: {
    color: '#7c3aed',
  },
  chevron: {
    fontSize: '12px',
    color: '#7c3aed',
    transition: 'transform 0.2s',
  },
  sectionName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#6b21a8',
  },
  count: {
    fontSize: '11px',
    color: '#7c3aed',
    backgroundColor: '#e9d5ff',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  content: {
    paddingLeft: '12px',
    marginTop: '8px',
  },
};

export function SectionGroup({
  sectionName,
  frameCount,
  children,
  defaultExpanded = true,
}: SectionGroupProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div style={styles.container}>
      <div style={styles.header} onClick={() => setIsExpanded(!isExpanded)}>
        <div style={styles.headerLeft}>
          <span
            style={{
              ...styles.chevron,
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          >
            ▶
          </span>
          <svg style={styles.folderIcon} width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 4.5C2 3.67 2.67 3 3.5 3H6.29c.4 0 .78.16 1.06.44l.7.7c.28.28.66.44 1.06.44H12.5c.83 0 1.5.67 1.5 1.5V11.5c0 .83-.67 1.5-1.5 1.5h-9C2.67 13 2 12.33 2 11.5V4.5Z"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
          </svg>
          <span style={styles.sectionName}>{sectionName}</span>
        </div>
        <span style={styles.count}>{frameCount} frame{frameCount > 1 ? 's' : ''}</span>
      </div>
      {isExpanded && <div style={styles.content}>{children}</div>}
    </div>
  );
}
