import React from 'react';
import { Tag } from './Tag';

interface TaskCardProps {
  frameName: string;
  title: string;
  description: string;
  tags: string[];
  storyTitle?: string;
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
  },
  frameName: {
    fontSize: '11px',
    color: '#999999',
    fontWeight: 500,
  },
  input: {
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid #e0e0e0',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'inherit',
    outline: 'none',
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
  },
  tagsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    alignItems: 'center',
  },
  storyLabel: {
    fontSize: '11px',
    color: '#666666',
  },
};

export function TaskCard({
  frameName,
  title,
  description,
  tags,
  storyTitle,
  onTitleChange,
  onDescriptionChange,
  onRemoveTag,
}: TaskCardProps): React.ReactElement {
  return (
    <div style={styles.card}>
      <span style={styles.frameName}>{frameName}</span>
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
      {storyTitle && (
        <span style={styles.storyLabel}>Story: {storyTitle}</span>
      )}
    </div>
  );
}
