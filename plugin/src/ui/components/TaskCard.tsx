import React from 'react';
import { Tag } from './Tag';

interface TaskCardProps {
  taskId: string;
  title: string;
  description: string;
  tags: string[];
  selected: boolean;
  onToggleSelect: () => void;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
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

export function TaskCard({
  taskId,
  title,
  description,
  tags,
  selected,
  onToggleSelect,
  onTitleChange,
  onDescriptionChange,
  onRemoveTag,
}: TaskCardProps): React.ReactElement {
  return (
    <div style={selected ? styles.card : styles.cardDeselected}>
      <div style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          style={styles.checkbox}
          aria-label={`Select task: ${title}`}
        />
        <div style={styles.content}>
          {selected ? (
            <>
              <input
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                style={styles.input}
              />
              <textarea
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                rows={3}
                style={styles.textarea}
              />
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
