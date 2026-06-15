import React, { useRef, useEffect } from 'react';
import { WorkItemType } from '../types';
import { Tag } from './Tag';

interface WorkItemCardProps {
  workItemType: WorkItemType;
  title: string;
  description?: string;
  tags: string[];
  selected: boolean;
  onToggleSelect: () => void;
  onTitleChange: (title: string) => void;
  onDescriptionChange?: (description: string) => void;
  onRemoveTag: (tag: string) => void;
  // Plugin 1 close flow: an item already in Azure renders read-only. `closed`
  // ones show a done badge with no action; open `existing` ones offer a
  // "close" checkbox instead of "create".
  existing?: boolean;
  closed?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid #E6ECF0',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    backgroundColor: '#ffffff',
  },
  cardDeselected: {
    border: '1px solid #E6ECF0',
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
    marginTop: '2px',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  titleTextarea: {
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid #E6ECF0',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    resize: 'none' as const,
    overflow: 'hidden',
    lineHeight: '1.4',
    minHeight: '32px',
  },
  textarea: {
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid #E6ECF0',
    fontSize: '12px',
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    outline: 'none',
    lineHeight: '1.4',
    width: '100%',
    boxSizing: 'border-box' as const,
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
  existingTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#333333',
    lineHeight: '1.4',
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap' as const,
  },
  badge: {
    fontSize: '11px',
    fontWeight: 500,
    padding: '1px 8px',
    borderRadius: '10px',
  },
};

export function WorkItemCard({
  workItemType,
  title,
  description,
  tags,
  selected,
  onToggleSelect,
  onTitleChange,
  onDescriptionChange,
  onRemoveTag,
  existing = false,
  closed = false,
}: WorkItemCardProps): React.ReactElement {
  const mode: 'create' | 'close' | 'closed' = closed
    ? 'closed'
    : existing
    ? 'close'
    : 'create';
  const getLabels = (): { itemLabel: string; titlePlaceholder: string; hasDescription: boolean } => {
    switch (workItemType) {
      case 'Epic':
        return { itemLabel: 'epic', titlePlaceholder: 'Epic title...', hasDescription: true };
      case 'Feature':
        return { itemLabel: 'feature', titlePlaceholder: 'Feature title...', hasDescription: true };
      case 'UserStory':
        return { itemLabel: 'story', titlePlaceholder: 'As a user, I want... so that...', hasDescription: false };
      case 'Task':
      default:
        return { itemLabel: 'task', titlePlaceholder: 'Task title...', hasDescription: true };
    }
  };

  const { itemLabel, titlePlaceholder, hasDescription } = getLabels();
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize title textarea
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = 'auto';
      titleRef.current.style.height = `${titleRef.current.scrollHeight}px`;
    }
  }, [title]);

  // Already in Azure and closed: read-only, done badge, no action.
  if (mode === 'closed') {
    return (
      <div style={styles.cardDeselected}>
        <div style={styles.content}>
          <div style={styles.existingTitle}>{title}</div>
          <div style={styles.badgeRow}>
            <span style={{ ...styles.badge, background: '#dcfce7', color: '#166534' }}>
              ✓ Closed
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Already in Azure and open: checkbox closes it (no editing).
  if (mode === 'close') {
    return (
      <div style={selected ? styles.card : styles.cardDeselected}>
        <div style={styles.checkboxRow}>
          <input
            type="checkbox"
            className="tasklist-checkbox"
            checked={selected}
            onChange={onToggleSelect}
            style={styles.checkbox}
            aria-label={`Close ${itemLabel}: ${title}`}
          />
          <div style={styles.content}>
            <div style={styles.existingTitle}>{title}</div>
            <div style={styles.badgeRow}>
              <span style={{ ...styles.badge, background: '#D9F7F3', color: '#0A6B60' }}>
                In Azure
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={selected ? styles.card : styles.cardDeselected}>
      <div style={styles.checkboxRow}>
        <input
          type="checkbox"
          className="tasklist-checkbox"
          checked={selected}
          onChange={onToggleSelect}
          style={styles.checkbox}
          aria-label={`Select ${itemLabel}: ${title}`}
        />
        <div style={styles.content}>
          {selected ? (
            <>
              <textarea
                ref={titleRef}
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                style={styles.titleTextarea}
                placeholder={titlePlaceholder}
                rows={1}
              />
              {hasDescription && onDescriptionChange && (
                <textarea
                  value={description || ''}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  rows={3}
                  style={styles.textarea}
                  placeholder="Description..."
                />
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
