import { useState, useEffect, useCallback, useRef } from 'react';
import { FrameData } from '../types';

interface FrameSelectionState {
  frames: FrameData[];
  frameCount: number;
}

interface UseFrameSelectionResult {
  frames: FrameData[];
  frameCount: number;
  requestFrames: () => void;
}

export function useFrameSelection(): UseFrameSelectionResult {
  // Use a single state object to prevent race conditions between frames and frameCount
  const [state, setState] = useState<FrameSelectionState>({
    frames: [],
    frameCount: 0,
  });

  // Track whether we have received full frame data (not just count)
  const hasFrameData = useRef(false);

  useEffect(() => {
    const handler = (event: MessageEvent): void => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === 'selection') {
        // Full frame data received - update both frames and count atomically
        hasFrameData.current = true;
        setState({
          frames: msg.frames,
          frameCount: msg.frames.length,
        });
      }

      if (msg.type === 'selection-count') {
        // Only update count if we haven't received full frame data yet,
        // or if the count is different (user changed selection)
        setState((prev) => {
          // If count changed, we need new frame data
          if (msg.count !== prev.frameCount) {
            hasFrameData.current = false;
            return {
              frames: [], // Clear frames since count changed
              frameCount: msg.count,
            };
          }
          return prev;
        });
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

  return { frames: state.frames, frameCount: state.frameCount, requestFrames };
}
