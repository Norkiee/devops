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

type TabKey = 'new' | 'open' | 'closed';
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
  tabBar: {
    display: 'flex',
    gap: '4px',
    borderBottom: '1px solid #E6ECF0',
    marginBottom: '12px',
  },
  tab: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 4px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#666666',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  tabActive: {
    color: '#01786A',
    borderBottom: '2px solid #01786A',
  },
  tabBadge: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#666666',
    backgroundColor: '#E6ECF0',
    padding: '1px 7px',
    borderRadius: '10px',
  },
  tabBadgeActive: {
    color: '#01786A',
    backgroundColor: '#E6FAF7',
  },
  selectAllRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '6px',
    marginBottom: '8px',
  },
  selectAllLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  selectAllLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#333333',
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
  emptyState: {
    textAlign: 'center' as const,
    color: '#999999',
    padding: '24px',
    fontSize: '13px',
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
      aria-label="Select all in tab"
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
  const createCount = newItems.filter((i) => i.selected).length;
  const closeCount = openItems.filter((i) => i.selected).length;

  // Only surface tabs that have items; order is New → Open → Closed.
  const tabs: { key: TabKey; label: string; count: number }[] = [];
  if (newItems.length > 0) tabs.push({ key: 'new', label: 'New', count: newItems.length });
  if (openItems.length > 0) tabs.push({ key: 'open', label: 'Open', count: openItems.length });
  if (closedItems.length > 0) tabs.push({ key: 'closed', label: 'Closed', count: closedItems.length });

  const [activeTab, setActiveTab] = useState<TabKey>(tabs[0]?.key ?? 'new');
  // Keep the active tab valid as sections appear or empty out (e.g. after the
  // user clears the closed tasks, the Closed tab disappears).
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.key === activeTab)) {
      setActiveTab(tabs[0].key);
    }
  }, [tabs, activeTab]);

  const activeItems =
    activeTab === 'new' ? newItems : activeTab === 'open' ? openItems : closedItems;

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

  // Select-all row, shown for the actionable tabs (New / Open) only.
  const renderSelectAll = (section: 'new' | 'open', items: ItemWithFrame[]) => {
    const selected = items.filter((i) => i.selected).length;
    return (
      <div style={styles.selectAllRow}>
        <div style={styles.selectAllLeft}>
          <SelectAllCheckbox
            allSelected={items.length > 0 && selected === items.length}
            someSelected={selected > 0}
            onChange={(checked) => onSelectSection(section, checked)}
          />
          <span style={styles.selectAllLabel}>Select all</span>
        </div>
        <span style={styles.itemCount}>
          {selected}/{items.length}
        </span>
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
        <p>Pick one tab to create or close — only one action at a time</p>
      </div>

      {parentTitle && activeTab === 'new' && createCount > 0 && (
        <div style={styles.parentInfo}>
          Creating under Story: <strong>{parentTitle}</strong>
        </div>
      )}

      {tabs.length > 0 ? (
        <>
          <div style={styles.tabBar} role="tablist">
            {tabs.map((t) => {
              const active = t.key === activeTab;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  style={{ ...styles.tab, ...(active ? styles.tabActive : {}) }}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}
                  <span
                    style={{ ...styles.tabBadge, ...(active ? styles.tabBadgeActive : {}) }}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="task-list">
            {(activeTab === 'new' || activeTab === 'open') &&
              renderSelectAll(activeTab, activeItems)}
            <div style={styles.itemList}>{activeItems.map(renderCard)}</div>
          </div>
        </>
      ) : (
        <div className="task-list">
          <p style={styles.emptyState}>No tasks to review.</p>
        </div>
      )}

      <div className="sticky-footer">
        {/* The primary action follows the active tab, so only one action is ever
            available at a time. */}
        {activeTab === 'new' && newItems.length > 0 && (
          <Button onClick={onSubmit} fullWidth disabled={createCount === 0}>
            Create {createCount} {createCount === 1 ? 'Task' : 'Tasks'}
          </Button>
        )}
        {activeTab === 'open' && openItems.length > 0 && (
          <Button onClick={onClose} fullWidth disabled={closeCount === 0}>
            Close {closeCount} {closeCount === 1 ? 'Task' : 'Tasks'}
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
