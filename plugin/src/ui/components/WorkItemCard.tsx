import React from 'react';
import { WorkItemType } from '../types';
import { Tag } from './Tag';

interface WorkItemCardProps {
  workItemId: string;
  workItemType: WorkItemType;
  title: string;
  description: string;
  acceptanceCriteria?: string;
  tags: string[];
  selected: boolean;
  onToggleSelect: () => void;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onAcceptanceCriteriaChange?: (criteria: string) => void;
  onRemoveTag: (tag: string) => void;
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    backgroundColor: '#ffffff',
  },
  cardDeselected: {
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    backgroundColor: '#f5f5f5',
    opacity: 0.6,
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    marginTop: '2px',
    cursor: 'pointer',
    accentColor: '#7c3aed',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  input: {
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid #e0e0e0',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid #e0e0e0',
    fontSize: '12px',
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    outline: 'none',
    lineHeight: '1.4',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  fieldLabel: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#666666',
    marginBottom: '2px',
  },
  tagsRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
    alignItems: 'center',
  },
  deselectedText: {
    fontSize: '12px',
    color: '#999999',
    fontStyle: 'italic',
  },
};

export function WorkItemCard({
  workItemId,
  workItemType,
  title,
  description,
  acceptanceCriteria,
  tags,
  selected,
  onToggleSelect,
  onTitleChange,
  onDescriptionChange,
  onAcceptanceCriteriaChange,
  onRemoveTag,
}: WorkItemCardProps): React.ReactElement {
  const getLabels = (): { itemLabel: string; titlePlaceholder: string; hasAcceptanceCriteria: boolean } => {
    switch (workItemType) {
      case 'Epic':
        return { itemLabel: 'epic', titlePlaceholder: 'Epic title...', hasAcceptanceCriteria: true };
      case 'Feature':
        return { itemLabel: 'feature', titlePlaceholder: 'Feature title...', hasAcceptanceCriteria: true };
      case 'UserStory':
        return { itemLabel: 'story', titlePlaceholder: 'User can...', hasAcceptanceCriteria: true };
      case 'Task':
      default:
        return { itemLabel: 'task', titlePlaceholder: 'Task title...', hasAcceptanceCriteria: false };
    }
  };

  const { itemLabel, titlePlaceholder, hasAcceptanceCriteria } = getLabels();

  return (
    <div style={selected ? styles.card : styles.cardDeselected}>
      <div style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          style={styles.checkbox}
          aria-label={`Select ${itemLabel}: ${title}`}
        />
        <div style={styles.content}>
          {selected ? (
            <>
              <input
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                style={styles.input}
                placeholder={titlePlaceholder}
              />
              <textarea
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                rows={3}
                style={styles.textarea}
                placeholder="Description..."
              />
              {hasAcceptanceCriteria && onAcceptanceCriteriaChange && (
                <div>
                  <label style={styles.fieldLabel}>Acceptance Criteria</label>
                  <textarea
                    value={acceptanceCriteria || ''}
                    onChange={(e) => onAcceptanceCriteriaChange(e.target.value)}
                    rows={4}
                    style={styles.textarea}
                    placeholder="- Criteria 1&#10;- Criteria 2&#10;- Criteria 3"
                  />
                </div>
              )}
              {tags.length > 0 && (
                <div style={styles.tagsRow}>
                  {tags.map((tag) => (
                    <Tag key={tag} label={tag} onRemove={() => onRemoveTag(tag)} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <span style={styles.deselectedText}>
              {title} (deselected - won't be created)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
