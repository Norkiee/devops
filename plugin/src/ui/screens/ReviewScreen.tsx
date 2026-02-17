import React, { useState } from 'react';
import { FrameTasks, TaskItem } from '../types';
import { Button } from '../components/Button';
import { TaskCard } from '../components/TaskCard';

interface ReviewScreenProps {
  frameTasks: FrameTasks[];
  selectedTags: string[];
  storyTitle: string;
  onTaskUpdate: (frameId: string, taskId: string, updates: Partial<TaskItem>) => void;
  onTaskToggle: (frameId: string, taskId: string) => void;
  onRemoveTag: (frameId: string, taskId: string, tag: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

const styles: Record<string, React.CSSProperties> = {
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
  taskCount: {
    fontSize: '11px',
    color: '#666666',
    backgroundColor: '#e0e0e0',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  taskList: {
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
  frameTasks,
  selectedTags,
  storyTitle,
  onTaskUpdate,
  onTaskToggle,
  onRemoveTag,
  onSubmit,
  onBack,
}: ReviewScreenProps): React.ReactElement {
  const [expandedFrames, setExpandedFrames] = useState<Set<string>>(
    new Set(frameTasks.map((ft) => ft.frameId))
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

  const totalTasks = frameTasks.reduce((sum, ft) => sum + ft.tasks.length, 0);
  const selectedCount = frameTasks.reduce(
    (sum, ft) => sum + ft.tasks.filter((t) => t.selected).length,
    0
  );

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>
          Review Tasks{' '}
          <span style={{ fontWeight: 400, color: '#999999' }}>
            ({totalTasks} tasks)
          </span>
        </h2>
        <p>Edit or remove tasks before pushing to Azure</p>
      </div>

      <div className="task-list">
        {frameTasks.map((frameTask) => {
          const isExpanded = expandedFrames.has(frameTask.frameId);
          const frameSelectedCount = frameTask.tasks.filter((t) => t.selected).length;

          return (
            <div key={frameTask.frameId} style={styles.frameGroup}>
              <div
                style={styles.frameHeader}
                onClick={() => toggleFrame(frameTask.frameId)}
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
                  <span style={styles.frameName}>{frameTask.frameName}</span>
                </div>
                <span style={styles.taskCount}>
                  {frameSelectedCount}/{frameTask.tasks.length} tasks
                </span>
              </div>

              {isExpanded && (
                <div style={styles.taskList}>
                  {frameTask.tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      taskId={task.id}
                      title={task.title}
                      description={task.description}
                      tags={selectedTags}
                      selected={task.selected}
                      onToggleSelect={() => onTaskToggle(frameTask.frameId, task.id)}
                      onTitleChange={(title) =>
                        onTaskUpdate(frameTask.frameId, task.id, { title })
                      }
                      onDescriptionChange={(description) =>
                        onTaskUpdate(frameTask.frameId, task.id, { description })
                      }
                      onRemoveTag={(tag) => onRemoveTag(frameTask.frameId, task.id, tag)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="sticky-footer">
        <div style={styles.footerStats}>
          {selectedCount} of {totalTasks} tasks selected
        </div>
        <Button onClick={onSubmit} fullWidth disabled={selectedCount === 0}>
          Create {selectedCount} Task{selectedCount !== 1 ? 's' : ''}
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
