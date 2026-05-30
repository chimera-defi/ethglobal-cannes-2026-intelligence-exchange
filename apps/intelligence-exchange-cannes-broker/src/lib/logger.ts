type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  ts: string;
  ctx: string;
  msg: string;
  [key: string]: unknown;
}

const IS_JSON = process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';

function emit(level: LogLevel, ctx: string, msg: string, extra?: Record<string, unknown>): void {
  const entry: LogEntry = { level, ts: new Date().toISOString(), ctx, msg, ...extra };
  const line = IS_JSON
    ? JSON.stringify(entry)
    : `[${ctx}] ${msg}${extra && Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''}`;

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export type Logger = ReturnType<typeof createLogger>;

export function createLogger(ctx: string) {
  return {
    debug: (msg: string, extra?: Record<string, unknown>) => emit('debug', ctx, msg, extra),
    info:  (msg: string, extra?: Record<string, unknown>) => emit('info',  ctx, msg, extra),
    warn:  (msg: string, extra?: Record<string, unknown>) => emit('warn',  ctx, msg, extra),
    error: (msg: string, extra?: Record<string, unknown>) => emit('error', ctx, msg, extra),
  };
}
