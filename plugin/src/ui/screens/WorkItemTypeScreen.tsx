import React from 'react';
import { WorkItemType } from '../types';
import { Button } from '../components/Button';

interface WorkItemTypeScreenProps {
  frameCount: number;
  sectionCount: number;
  savedWorkItemType?: WorkItemType;
  onSelect: (type: WorkItemType) => void;
  onBack: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  optionCard: {
    padding: '16px',
    borderRadius: '12px',
    border: '1px solid #e0e0e0',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
    background: '#ffffff',
  },
  optionCardHover: {
    borderColor: '#7c3aed',
    background: '#faf5ff',
  },
  optionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  },
  optionIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
  },
  storyIcon: {
    background: '#dbeafe',
    color: '#2563eb',
  },
  taskIcon: {
    background: '#dcfce7',
    color: '#16a34a',
  },
  optionTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#333333',
  },
  optionDescription: {
    fontSize: '13px',
    color: '#666666',
    lineHeight: '1.4',
    marginLeft: '44px',
  },
  cardsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    flex: 1,
  },
  badge: {
    background: '#f3e8ff',
    color: '#7c3aed',
    fontSize: '12px',
    fontWeight: 500,
    padding: '4px 8px',
    borderRadius: '6px',
    marginBottom: '12px',
    display: 'inline-block',
  },
};

export function WorkItemTypeScreen({
  frameCount,
  sectionCount,
  savedWorkItemType,
  onSelect,
  onBack,
}: WorkItemTypeScreenProps): React.ReactElement {
  const [hoveredType, setHoveredType] = React.useState<WorkItemType | null>(
    savedWorkItemType || null
  );

  const frameLabel = sectionCount > 0
    ? `${sectionCount} section${sectionCount > 1 ? 's' : ''} (${frameCount} frame${frameCount > 1 ? 's' : ''})`
    : `${frameCount} frame${frameCount > 1 ? 's' : ''}`;

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>What do you want to generate?</h2>
        <p>Choose the type of work items to create</p>
      </div>

      <div style={styles.badge}>{frameLabel} ready</div>

      <div style={styles.cardsContainer as React.CSSProperties}>
        <div
          style={{
            ...styles.optionCard,
            ...(hoveredType === 'UserStory' ? styles.optionCardHover : {}),
          }}
          onClick={() => onSelect('UserStory')}
          onMouseEnter={() => setHoveredType('UserStory')}
          onMouseLeave={() => setHoveredType(null)}
        >
          <div style={styles.optionHeader}>
            <div style={{ ...styles.optionIcon, ...styles.storyIcon }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <span style={styles.optionTitle}>User Stories</span>
          </div>
          <p style={styles.optionDescription}>
            Create user stories with acceptance criteria under an Epic
          </p>
        </div>

        <div
          style={{
            ...styles.optionCard,
            ...(hoveredType === 'Task' ? styles.optionCardHover : {}),
          }}
          onClick={() => onSelect('Task')}
          onMouseEnter={() => setHoveredType('Task')}
          onMouseLeave={() => setHoveredType(null)}
        >
          <div style={styles.optionHeader}>
            <div style={{ ...styles.optionIcon, ...styles.taskIcon }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="3" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M5.5 8L7 9.5L10.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span style={styles.optionTitle}>Tasks</span>
          </div>
          <p style={styles.optionDescription}>
            Create development tasks under a User Story
          </p>
        </div>
      </div>

      <div className="screen-footer">
        <Button onClick={onBack} variant="text" fullWidth>
          Back
        </Button>
      </div>
    </div>
  );
}
