import React, { useState } from 'react';
import { FrameData, WorkItemType } from '../types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { FrameChip } from '../components/FrameChip';

interface ContextScreenProps {
  frames: FrameData[];
  workItemType?: WorkItemType;
  parentTitle?: string;
  onGenerate: (context?: string) => void;
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
};

export function ContextScreen({
  frames,
  workItemType = 'Task',
  parentTitle,
  onGenerate,
  onBack,
}: ContextScreenProps): React.ReactElement {
  const [context, setContext] = useState('');

  const getItemLabel = (): string => {
    switch (workItemType) {
      case 'Epic': return 'epics';
      case 'Feature': return 'features';
      case 'UserStory': return 'user stories';
      case 'Task': return 'tasks';
      default: return 'work items';
    }
  };

  const getButtonLabel = (): string => {
    switch (workItemType) {
      case 'Epic': return 'Epics';
      case 'Feature': return 'Features';
      case 'UserStory': return 'User Stories';
      case 'Task': return 'Tasks';
      default: return 'Work Items';
    }
  };

  const itemLabel = getItemLabel();

  // Group frames by section for display
  const framesBySection: Record<string, FrameData[]> = {};
  const ungroupedFrames: FrameData[] = [];

  for (const frame of frames) {
    if (frame.sectionName) {
      if (!framesBySection[frame.sectionName]) {
        framesBySection[frame.sectionName] = [];
      }
      framesBySection[frame.sectionName].push(frame);
    } else {
      ungroupedFrames.push(frame);
    }
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Add Context</h2>
        <p>Help AI generate better {itemLabel}</p>
      </div>

      {parentTitle && (
        <div style={styles.parentInfo}>
          Creating under: <strong>{parentTitle}</strong>
        </div>
      )}

      <div className="frame-chips">
        {Object.entries(framesBySection).map(([sectionName, sectionFrames]) => (
          <div key={sectionName} style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 500, marginBottom: '4px' }}>
              {sectionName}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {sectionFrames.map((frame) => (
                <FrameChip key={frame.id} name={frame.name} />
              ))}
            </div>
          </div>
        ))}
        {ungroupedFrames.map((frame) => (
          <FrameChip key={frame.id} name={frame.name} />
        ))}
      </div>

      <Input
        label="Additional context (optional)"
        value={context}
        onChange={setContext}
        placeholder="e.g., User onboarding flow for mobile app"
        multiline
        rows={4}
      />

      <div className="screen-footer">
        <Button
          onClick={() => onGenerate(context || undefined)}
          fullWidth
        >
          Generate {getButtonLabel()}
        </Button>
        <Button onClick={onBack} variant="text" fullWidth>
          Back
        </Button>
      </div>
    </div>
  );
}
