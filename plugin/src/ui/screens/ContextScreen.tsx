import React, { useState } from 'react';
import { FrameData } from '../types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { FrameChip } from '../components/FrameChip';

interface ContextScreenProps {
  frames: FrameData[];
  onGenerate: (context?: string) => void;
}

export function ContextScreen({
  frames,
  onGenerate,
}: ContextScreenProps): React.ReactElement {
  const [context, setContext] = useState('');

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Add context</h2>
        <p>Help AI generate better task generations</p>
      </div>

      <div className="frame-chips">
        {frames.map((frame) => (
          <FrameChip key={frame.id} name={frame.name} />
        ))}
      </div>

      <Input
        label="Context(optional)"
        value={context}
        onChange={setContext}
        placeholder="e.g., User onboarding flow for mobile app"
        multiline
        rows={5}
      />

      <div className="screen-footer">
        <Button
          onClick={() => onGenerate(context || undefined)}
          fullWidth
        >
          Generate tasks
        </Button>
      </div>
    </div>
  );
}
