import React from 'react';
import { TaskToSubmit } from '../types';
import { Button } from '../components/Button';
import { TaskCard } from '../components/TaskCard';

interface ReviewScreenProps {
  tasks: TaskToSubmit[];
  storyTitle: string;
  onTaskChange: (index: number, updates: Partial<TaskToSubmit>) => void;
  onRemoveTag: (taskIndex: number, tag: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export function ReviewScreen({
  tasks,
  storyTitle,
  onTaskChange,
  onRemoveTag,
  onSubmit,
  onBack,
}: ReviewScreenProps): React.ReactElement {
  return (
    <div className="screen">
      <div className="screen-header">
        <h2>
          Review Tasks{' '}
          <span style={{ fontWeight: 400, color: '#999999' }}>
            ({tasks.length})
          </span>
        </h2>
        <p>Edit before pushing to Azure</p>
      </div>

      <div className="task-list">
        {tasks.map((task, index) => (
          <TaskCard
            key={task.frameId}
            frameName={task.frameName}
            title={task.title}
            description={task.description}
            tags={task.tags}
            storyTitle={storyTitle}
            onTitleChange={(title) => onTaskChange(index, { title })}
            onDescriptionChange={(description) =>
              onTaskChange(index, { description })
            }
            onRemoveTag={(tag) => onRemoveTag(index, tag)}
          />
        ))}
      </div>

      <div className="sticky-footer">
        <Button onClick={onSubmit} fullWidth>
          Create {tasks.length} Task{tasks.length > 1 ? 's' : ''}
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
