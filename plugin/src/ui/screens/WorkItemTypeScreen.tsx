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
  epicIcon: {
    background: '#FFF4E5',
    color: '#FF7B00',
  },
  featureIcon: {
    background: '#F3E8FF',
    color: '#773B93',
  },
  storyIcon: {
    background: '#E5F6FF',
    color: '#009CCC',
  },
  taskIcon: {
    background: '#FFFBE5',
    color: '#F2CB1D',
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
    overflowY: 'auto',
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

// Work item type configuration
interface TypeConfig {
  type: WorkItemType;
  azureName: string;
  title: string;
  description: string;
  iconStyle: React.CSSProperties;
  icon: React.ReactNode;
}

const typeConfigs: TypeConfig[] = [
  {
    type: 'Epic',
    azureName: 'Epic',
    title: 'Epics',
    description: 'Create high-level epics representing major design initiatives',
    iconStyle: styles.epicIcon,
    icon: (
      // Azure DevOps Epic icon - lightning bolt/crown
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M9 2L4 9h4l-1 5 5-7H8l1-5z"/>
      </svg>
    ),
  },
  {
    type: 'Feature',
    azureName: 'Feature',
    title: 'Features',
    description: 'Create features under an Epic',
    iconStyle: styles.featureIcon,
    icon: (
      // Azure DevOps Feature icon - trophy/rocket
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 2L5.5 5.5H2L4 8l-2 4h4l2 2 2-2h4l-2-4 2-2.5h-3.5L8 2zm0 2.5l1.5 2h2l-1 1.5 1 2.5h-2L8 12l-1.5-1.5H4.5l1-2.5-1-1.5h2L8 4.5z"/>
      </svg>
    ),
  },
  {
    type: 'UserStory',
    azureName: 'User Story',
    title: 'User Stories',
    description: 'Create user stories under an Epic or Feature',
    iconStyle: styles.storyIcon,
    icon: (
      // Azure DevOps User Story icon - book
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M3 2.5A1.5 1.5 0 014.5 1h7A1.5 1.5 0 0113 2.5v11a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 13.5v-11zM4.5 2a.5.5 0 00-.5.5v11a.5.5 0 00.5.5h7a.5.5 0 00.5-.5v-11a.5.5 0 00-.5-.5h-7z"/>
        <path d="M5 4h6v1H5V4zm0 2h6v1H5V6zm0 2h4v1H5V8z"/>
      </svg>
    ),
  },
  {
    type: 'Task',
    azureName: 'Task',
    title: 'Tasks',
    description: 'Create design tasks under a User Story',
    iconStyle: styles.taskIcon,
    icon: (
      // Azure DevOps Task icon - checkbox
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M2.5 2A1.5 1.5 0 001 3.5v9A1.5 1.5 0 002.5 14h9a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0011.5 2h-9zM2 3.5a.5.5 0 01.5-.5h9a.5.5 0 01.5.5v9a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5v-9z"/>
        <path d="M10.354 5.354l-4 4a.5.5 0 01-.708 0l-2-2a.5.5 0 11.708-.708L6 8.293l3.646-3.647a.5.5 0 01.708.708z"/>
      </svg>
    ),
  },
];

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
        {typeConfigs.map((config) => (
          <div
            key={config.type}
            style={{
              ...styles.optionCard,
              ...(hoveredType === config.type ? styles.optionCardHover : {}),
            }}
            onClick={() => onSelect(config.type)}
            onMouseEnter={() => setHoveredType(config.type)}
            onMouseLeave={() => setHoveredType(null)}
          >
            <div style={styles.optionHeader}>
              <div style={{ ...styles.optionIcon, ...config.iconStyle }}>
                {config.icon}
              </div>
              <span style={styles.optionTitle}>{config.title}</span>
            </div>
            <p style={styles.optionDescription}>{config.description}</p>
          </div>
        ))}
      </div>

      <div className="screen-footer">
        <Button onClick={onBack} variant="text" fullWidth>
          Back
        </Button>
      </div>
    </div>
  );
}
