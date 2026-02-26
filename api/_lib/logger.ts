// Simple request logging utility for API endpoints

interface LogContext {
  endpoint: string;
  method: string;
  duration?: number;
  status?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export function logRequest(context: LogContext): void {
  const timestamp = new Date().toISOString();
  const { endpoint, method, duration, status, error, metadata } = context;

  const logEntry = {
    timestamp,
    endpoint,
    method,
    ...(duration !== undefined && { durationMs: duration }),
    ...(status !== undefined && { status }),
    ...(error && { error }),
    ...(metadata && { metadata }),
  };

  if (error) {
    console.error('[API]', JSON.stringify(logEntry));
  } else {
    console.log('[API]', JSON.stringify(logEntry));
  }
}

export function createRequestLogger(endpoint: string, method: string) {
  const startTime = Date.now();

  return {
    success(status: number, metadata?: Record<string, unknown>): void {
      logRequest({
        endpoint,
        method,
        duration: Date.now() - startTime,
        status,
        metadata,
      });
    },
    error(status: number, error: string, metadata?: Record<string, unknown>): void {
      logRequest({
        endpoint,
        method,
        duration: Date.now() - startTime,
        status,
        error,
        metadata,
      });
    },
  };
}
