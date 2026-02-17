import { useEffect, useRef } from 'react';

export function useAutoResize(): React.RefObject<HTMLDivElement> {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const sendResize = () => {
      const height = container.scrollHeight;
      parent.postMessage(
        { pluginMessage: { type: 'resize', height } },
        '*'
      );
    };

    // Initial resize
    sendResize();

    // Observe size changes
    const resizeObserver = new ResizeObserver(() => {
      sendResize();
    });

    resizeObserver.observe(container);

    // Also observe mutations for dynamic content
    const mutationObserver = new MutationObserver(() => {
      sendResize();
    });

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return containerRef;
}
