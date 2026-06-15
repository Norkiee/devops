import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '../components/Button';
import { LoadingSpinner } from '../components/LoadingSpinner';

// One parsed line as reported by main.ts (the Figma-sandbox parser).
export interface ParsedItem {
  title: string;
  hash: string;
  alreadyCreated: boolean;
  azureId?: number; // present when alreadyCreated — used to verify it still exists
}

export interface ParseResult {
  frameId: string;
  frameName: string;
  items: ParsedItem[];
}

interface ParseTasklistScreenProps {
  parentTitle?: string;
  onParsed: (result: ParseResult) => void;
  onBack: () => void;
}

// Plugin 1 (team): reads the selected tasklist frame via main.ts and forwards
// the parsed lines to Review. Replaces the AI ContextScreen/GeneratingScreen —
// no Claude call; titles come straight from the tasklist text.
export function ParseTasklistScreen({
  parentTitle,
  onParsed,
  onBack,
}: ParseTasklistScreenProps): React.ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const requestParse = useCallback(() => {
    setError(null);
    setLoading(true);
    parent.postMessage({ pluginMessage: { type: 'parse-tasklist' } }, '*');
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent): void => {
      const msg = event.data?.pluginMessage;
      if (!msg || msg.type !== 'parse-result') return;

      if (msg.error === 'select-tasklist') {
        setLoading(false);
        setError('Select the tasklist frame in Figma, then try again.');
        return;
      }

      const items: ParsedItem[] = msg.items || [];
      if (items.length === 0) {
        setLoading(false);
        setError(
          'No task lines found. Make sure the frame has a numbered or bulleted list.'
        );
        return;
      }

      onParsed({ frameId: msg.frameId, frameName: msg.frameName, items });
    };

    window.addEventListener('message', handler);
    requestParse();
    return () => window.removeEventListener('message', handler);
  }, [onParsed, requestParse]);

  if (loading) {
    return (
      <div className="screen screen-center">
        <LoadingSpinner label="Reading tasklist..." sublabel="Parsing selected frame" />
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Read tasklist</h2>
        {parentTitle && <p>Creating tasks under {parentTitle}</p>}
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="screen-footer">
        <Button onClick={requestParse} fullWidth>
          Retry
        </Button>
        <Button onClick={onBack} variant="text" fullWidth>
          Back
        </Button>
      </div>
    </div>
  );
}
