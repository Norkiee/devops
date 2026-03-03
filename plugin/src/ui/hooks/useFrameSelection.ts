import { useState, useEffect, useCallback, useRef } from 'react';
import { FrameData, SectionData } from '../types';

interface FrameSelectionState {
  frames: FrameData[];
  sections: SectionData[];
  frameCount: number;
  sectionCount: number;
}

interface UseFrameSelectionResult {
  frames: FrameData[];
  sections: SectionData[];
  frameCount: number;
  sectionCount: number;
  requestFrames: () => void;
}

export function useFrameSelection(): UseFrameSelectionResult {
  // Use a single state object to prevent race conditions between frames and frameCount
  const [state, setState] = useState<FrameSelectionState>({
    frames: [],
    sections: [],
    frameCount: 0,
    sectionCount: 0,
  });

  // Track whether we have received full frame data (not just count)
  const hasFrameData = useRef(false);

  useEffect(() => {
    const handler = (event: MessageEvent): void => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === 'selection') {
        // Full frame data received - update everything atomically
        hasFrameData.current = true;
        setState({
          frames: msg.frames || [],
          sections: msg.sections || [],
          frameCount: msg.frames?.length || 0,
          sectionCount: msg.sections?.length || 0,
        });
      }

      if (msg.type === 'selection-changed') {
        // Selection count changed - may need to refetch frames
        setState((prev) => {
          // If count changed, we need new frame data
          if (
            msg.frameCount !== prev.frameCount ||
            msg.sectionCount !== prev.sectionCount
          ) {
            hasFrameData.current = false;
            return {
              frames: [], // Clear frames since count changed
              sections: msg.sections || [],
              frameCount: msg.frameCount,
              sectionCount: msg.sectionCount,
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

  return {
    frames: state.frames,
    sections: state.sections,
    frameCount: state.frameCount,
    sectionCount: state.sectionCount,
    requestFrames,
  };
}
