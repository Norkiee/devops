import { useState, useEffect, useCallback } from 'react';
import { FrameData } from '../types';

interface UseFrameSelectionResult {
  frames: FrameData[];
  frameCount: number;
  requestFrames: () => void;
}

export function useFrameSelection(): UseFrameSelectionResult {
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [frameCount, setFrameCount] = useState(0);

  useEffect(() => {
    const handler = (event: MessageEvent): void => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === 'selection') {
        setFrames(msg.frames);
        setFrameCount(msg.frames.length);
      }

      if (msg.type === 'selection-count') {
        setFrameCount(msg.count);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const requestFrames = useCallback(() => {
    parent.postMessage(
      { pluginMessage: { type: 'get-selection' } },
      '*'
    );
  }, []);

  return { frames, frameCount, requestFrames };
}
