import React from 'react';
import { WorkItemType, WorkItemTypeInfo } from '../types';
import { Button } from '../components/Button';

interface WorkItemTypeScreenProps {
  frameCount: number;
  sectionCount: number;
  savedWorkItemType?: WorkItemType;
  availableTypes?: WorkItemTypeInfo[];
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
    background: '#fef3c7',
    color: '#d97706',
  },
  featureIcon: {
    background: '#e0e7ff',
    color: '#4f46e5',
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
    description: 'Create high-level epics representing major product initiatives',
    iconStyle: styles.epicIcon,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2L14 5.5V10.5L8 14L2 10.5V5.5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M8 6V10M6 8H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    type: 'Feature',
    azureName: 'Feature',
    title: 'Features',
    description: 'Create features with acceptance criteria under an Epic',
    iconStyle: styles.featureIcon,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    type: 'UserStory',
    azureName: 'User Story',
    title: 'User Stories',
    description: 'Create user stories with acceptance criteria under an Epic or Feature',
    iconStyle: styles.storyIcon,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    type: 'Task',
    azureName: 'Task',
    title: 'Tasks',
    description: 'Create development tasks under a User Story',
    iconStyle: styles.taskIcon,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="3" y="3" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M5.5 8L7 9.5L10.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export function WorkItemTypeScreen({
  frameCount,
  sectionCount,
  savedWorkItemType,
  availableTypes,
  onSelect,
  onBack,
}: WorkItemTypeScreenProps): React.ReactElement {
  const [hoveredType, setHoveredType] = React.useState<WorkItemType | null>(
    savedWorkItemType || null
  );

  const frameLabel = sectionCount > 0
    ? `${sectionCount} section${sectionCount > 1 ? 's' : ''} (${frameCount} frame${frameCount > 1 ? 's' : ''})`
    : `${frameCount} frame${frameCount > 1 ? 's' : ''}`;

  // Filter type configs based on available types from Azure DevOps
  const visibleTypes = availableTypes && availableTypes.length > 0
    ? typeConfigs.filter((config) =>
        availableTypes.some((at) => at.name === config.azureName)
      )
    : typeConfigs.filter((config) =>
        // Default to showing User Story and Task if no types loaded yet
        config.type === 'UserStory' || config.type === 'Task'
      );

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>What do you want to generate?</h2>
        <p>Choose the type of work items to create</p>
      </div>

      <div style={styles.badge}>{frameLabel} ready</div>

      <div style={styles.cardsContainer as React.CSSProperties}>
        {visibleTypes.map((config) => (
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
