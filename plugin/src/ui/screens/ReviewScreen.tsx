import React, { useState } from 'react';
import { FrameWorkItems, WorkItem, WorkItemType } from '../types';
import { Button } from '../components/Button';
import { WorkItemCard } from '../components/WorkItemCard';
import { SectionGroup } from '../components/SectionGroup';

interface ReviewScreenProps {
  frameWorkItems: FrameWorkItems[];
  workItemType: WorkItemType;
  selectedTags: string[];
  parentTitle: string;
  onWorkItemUpdate: (frameId: string, workItemId: string, updates: Partial<WorkItem>) => void;
  onWorkItemToggle: (frameId: string, workItemId: string) => void;
  onRemoveTag: (frameId: string, workItemId: string, tag: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  parentInfo: {
    background: '#f3e8ff',
    border: '1px solid #d8b4fe',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '12px',
    color: '#6b21a8',
    marginBottom: '12px',
  },
  frameGroup: {
    marginBottom: '12px',
  },
  frameHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '6px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  frameHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  chevron: {
    fontSize: '12px',
    color: '#666666',
    transition: 'transform 0.2s',
  },
  frameName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#333333',
  },
  itemCount: {
    fontSize: '11px',
    color: '#666666',
    backgroundColor: '#e0e0e0',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  itemList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    marginTop: '8px',
    paddingLeft: '8px',
  },
  footerStats: {
    fontSize: '13px',
    color: '#666666',
    marginBottom: '8px',
    textAlign: 'center' as const,
  },
};

export function ReviewScreen({
  frameWorkItems,
  workItemType,
  selectedTags,
  parentTitle,
  onWorkItemUpdate,
  onWorkItemToggle,
  onRemoveTag,
  onSubmit,
  onBack,
}: ReviewScreenProps): React.ReactElement {
  const [expandedFrames, setExpandedFrames] = useState<Set<string>>(
    new Set(frameWorkItems.map((fwi) => fwi.frameId))
  );

  const toggleFrame = (frameId: string) => {
    setExpandedFrames((prev) => {
      const next = new Set(prev);
      if (next.has(frameId)) {
        next.delete(frameId);
      } else {
        next.add(frameId);
      }
      return next;
    });
  };

  const isUserStory = workItemType === 'UserStory';
  const itemLabel = isUserStory ? 'User Stories' : 'Tasks';
  const itemLabelSingular = isUserStory ? 'User Story' : 'Task';
  const parentLabel = isUserStory ? 'Epic' : 'Story';

  const totalItems = frameWorkItems.reduce((sum, fwi) => sum + fwi.workItems.length, 0);
  const selectedCount = frameWorkItems.reduce(
    (sum, fwi) => sum + fwi.workItems.filter((item) => item.selected).length,
    0
  );

  // Group frames by section
  const framesBySection: Record<string, FrameWorkItems[]> = {};
  const ungroupedFrames: FrameWorkItems[] = [];

  for (const fwi of frameWorkItems) {
    if (fwi.sectionName) {
      if (!framesBySection[fwi.sectionName]) {
        framesBySection[fwi.sectionName] = [];
      }
      framesBySection[fwi.sectionName].push(fwi);
    } else {
      ungroupedFrames.push(fwi);
    }
  }

  const renderFrameGroup = (fwi: FrameWorkItems) => {
    const isExpanded = expandedFrames.has(fwi.frameId);
    const frameSelectedCount = fwi.workItems.filter((item) => item.selected).length;

    return (
      <div key={fwi.frameId} style={styles.frameGroup}>
        <div
          style={styles.frameHeader}
          onClick={() => toggleFrame(fwi.frameId)}
        >
          <div style={styles.frameHeaderLeft}>
            <span
              style={{
                ...styles.chevron,
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            >
              ▶
            </span>
            <span style={styles.frameName}>{fwi.frameName}</span>
          </div>
          <span style={styles.itemCount}>
            {frameSelectedCount}/{fwi.workItems.length} {fwi.workItems.length === 1 ? itemLabelSingular.toLowerCase() : itemLabel.toLowerCase()}
          </span>
        </div>

        {isExpanded && (
          <div style={styles.itemList}>
            {fwi.workItems.map((item) => (
              <WorkItemCard
                key={item.id}
                workItemId={item.id}
                workItemType={workItemType}
                title={item.title}
                description={item.description}
                acceptanceCriteria={item.acceptanceCriteria}
                tags={selectedTags}
                selected={item.selected}
                onToggleSelect={() => onWorkItemToggle(fwi.frameId, item.id)}
                onTitleChange={(title) =>
                  onWorkItemUpdate(fwi.frameId, item.id, { title })
                }
                onDescriptionChange={(description) =>
                  onWorkItemUpdate(fwi.frameId, item.id, { description })
                }
                onAcceptanceCriteriaChange={
                  isUserStory
                    ? (acceptanceCriteria) =>
                        onWorkItemUpdate(fwi.frameId, item.id, { acceptanceCriteria })
                    : undefined
                }
                onRemoveTag={(tag) => onRemoveTag(fwi.frameId, item.id, tag)}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>
          Review {itemLabel}{' '}
          <span style={{ fontWeight: 400, color: '#999999' }}>
            ({totalItems} total)
          </span>
        </h2>
        <p>Edit or remove items before pushing to Azure</p>
      </div>

      <div style={styles.parentInfo}>
        Creating under {parentLabel}: <strong>{parentTitle}</strong>
      </div>

      <div className="task-list">
        {/* Render grouped frames by section */}
        {Object.entries(framesBySection).map(([sectionName, frames]) => (
          <SectionGroup
            key={sectionName}
            sectionName={sectionName}
            frameCount={frames.length}
          >
            {frames.map(renderFrameGroup)}
          </SectionGroup>
        ))}

        {/* Render ungrouped frames */}
        {ungroupedFrames.map(renderFrameGroup)}
      </div>

      <div className="sticky-footer">
        <div style={styles.footerStats}>
          {selectedCount} of {totalItems} {selectedCount === 1 ? itemLabelSingular.toLowerCase() : itemLabel.toLowerCase()} selected
        </div>
        <Button onClick={onSubmit} fullWidth disabled={selectedCount === 0}>
          Create {selectedCount} {selectedCount === 1 ? itemLabelSingular : itemLabel}
        </Button>
        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <button className="link-button" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
