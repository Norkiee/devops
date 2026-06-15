import React, { useEffect, useRef, useState } from 'react';
import { FrameWorkItems, WorkItem, WorkItemType } from '../types';
import { Button } from '../components/Button';
import { WorkItemCard } from '../components/WorkItemCard';

interface ReviewScreenProps {
  frameWorkItems: FrameWorkItems[];
  workItemType: WorkItemType;
  selectedTags: string[];
  parentTitle: string;
  onWorkItemUpdate: (frameId: string, workItemId: string, updates: Partial<WorkItem>) => void;
  onWorkItemToggle: (frameId: string, workItemId: string) => void;
  onSelectSection: (section: 'new' | 'open', selected: boolean) => void;
  onRemoveTag: (frameId: string, workItemId: string, tag: string) => void;
  onSubmit: () => void;
  onClose?: () => void;
  onBack: () => void;
}

type ItemWithFrame = WorkItem & { frameId: string };

const styles: Record<string, React.CSSProperties> = {
  parentInfo: {
    background: '#E6FAF7',
    border: '1px solid #7FE0D6',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '12px',
    color: '#0A6B60',
    marginBottom: '12px',
  },
  section: {
    marginBottom: '16px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '6px',
    marginBottom: '8px',
  },
  sectionHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#333333',
  },
  chevron: {
    fontSize: '10px',
    color: '#666666',
    transition: 'transform 0.15s',
    display: 'inline-block',
  },
  itemCount: {
    fontSize: '11px',
    color: '#666666',
    backgroundColor: '#E6ECF0',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  itemList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
};

// Checkbox that supports the indeterminate (partial) state for "select all".
function SelectAllCheckbox({
  allSelected,
  someSelected,
  onChange,
}: {
  allSelected: boolean;
  someSelected: boolean;
  onChange: (checked: boolean) => void;
}): React.ReactElement {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someSelected && !allSelected;
  }, [allSelected, someSelected]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="tasklist-checkbox"
      checked={allSelected}
      onChange={(e) => onChange(e.target.checked)}
      aria-label="Select all in section"
    />
  );
}

export function ReviewScreen({
  frameWorkItems,
  workItemType,
  selectedTags,
  parentTitle,
  onWorkItemUpdate,
  onWorkItemToggle,
  onSelectSection,
  onRemoveTag,
  onSubmit,
  onClose,
  onBack,
}: ReviewScreenProps): React.ReactElement {
  const allItems: ItemWithFrame[] = frameWorkItems.flatMap((fwi) =>
    fwi.workItems.map((item) => ({ ...item, frameId: fwi.frameId }))
  );
  const newItems = allItems.filter((i) => !i.existing);
  const openItems = allItems.filter((i) => i.existing && !i.closed);
  const closedItems = allItems.filter((i) => i.existing && i.closed);

  const totalItems = allItems.length;
  const [closedOpen, setClosedOpen] = useState(false);
  const createCount = newItems.filter((i) => i.selected).length;
  const closeCount = openItems.filter((i) => i.selected).length;

  const renderCard = (item: ItemWithFrame) => (
    <WorkItemCard
      key={item.id}
      workItemType={workItemType}
      title={item.title}
      description={item.description}
      tags={selectedTags}
      selected={item.selected}
      existing={item.existing}
      closed={item.closed}
      onToggleSelect={() => onWorkItemToggle(item.frameId, item.id)}
      onTitleChange={(title) => onWorkItemUpdate(item.frameId, item.id, { title })}
      onDescriptionChange={(description) =>
        onWorkItemUpdate(item.frameId, item.id, { description })
      }
      onRemoveTag={(tag) => onRemoveTag(item.frameId, item.id, tag)}
    />
  );

  // Section with a select-all checkbox (New / Open).
  const renderSection = (title: string, section: 'new' | 'open', items: ItemWithFrame[]) => {
    const selected = items.filter((i) => i.selected).length;
    return (
      <div style={styles.section} key={section}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionHeaderLeft}>
            <SelectAllCheckbox
              allSelected={selected === items.length}
              someSelected={selected > 0}
              onChange={(checked) => onSelectSection(section, checked)}
            />
            <span style={styles.sectionTitle}>{title}</span>
          </div>
          <span style={styles.itemCount}>
            {selected}/{items.length}
          </span>
        </div>
        <div style={styles.itemList}>{items.map(renderCard)}</div>
      </div>
    );
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>
          Review tasks{' '}
          <span style={{ fontWeight: 400, color: '#999999' }}>({totalItems} total)</span>
        </h2>
        <p>Pick one section to create or close — only one action at a time</p>
      </div>

      {parentTitle && createCount > 0 && (
        <div style={styles.parentInfo}>
          Creating under Story: <strong>{parentTitle}</strong>
        </div>
      )}

      <div className="task-list">
        {newItems.length > 0 && renderSection('New tasks', 'new', newItems)}
        {openItems.length > 0 && renderSection('Open tasks', 'open', openItems)}
        {closedItems.length > 0 && (
          <div style={styles.section}>
            <div
              style={{ ...styles.sectionHeader, cursor: 'pointer' }}
              onClick={() => setClosedOpen((o) => !o)}
            >
              <div style={styles.sectionHeaderLeft}>
                <span
                  style={{
                    ...styles.chevron,
                    transform: closedOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  }}
                >
                  ▶
                </span>
                <span style={styles.sectionTitle}>Closed</span>
              </div>
              <span style={styles.itemCount}>{closedItems.length}</span>
            </div>
            {closedOpen && <div style={styles.itemList}>{closedItems.map(renderCard)}</div>}
          </div>
        )}
      </div>

      <div className="sticky-footer">
        {/* One action at a time: Close when the Open section is active,
            otherwise Create (disabled until New items are selected). */}
        {closeCount > 0 ? (
          <Button onClick={onClose} fullWidth>
            Close {closeCount} {closeCount === 1 ? 'Task' : 'Tasks'}
          </Button>
        ) : (
          <Button onClick={onSubmit} fullWidth disabled={createCount === 0}>
            Create {createCount} {createCount === 1 ? 'Task' : 'Tasks'}
          </Button>
        )}
        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <button className="link-button" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
