import React from 'react';
import { FrameData } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';

interface GeneratingScreenProps {
  frames: FrameData[];
  completedFrameIds: Set<string>;
}

export function GeneratingScreen({
  frames,
}: GeneratingScreenProps): React.ReactElement {
  return (
    <div className="screen screen-center">
      <LoadingSpinner
        label="Generating tasks..."
        sublabel={`Analyzing ${frames.length} frame${frames.length > 1 ? 's' : ''}`}
      />
    </div>
  );
}
