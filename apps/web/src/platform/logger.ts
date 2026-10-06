type Level = 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const SENSITIVE_KEY = /password|token|secret|code|authorization|cookie/i;
const STREAM: Record<Level, 'log' | 'warn' | 'error'> = {
  info: 'log',
  warn: 'warn',
  error: 'error',
};

function sanitize(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value as Fields).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[redacted]' : sanitize(entry, depth + 1),
    ]),
  );
}

function write(level: Level, message: string, fields: Fields = {}): void {
  const entry = {
    ...(sanitize(fields) as Fields),
    level,
    message,
    timestamp: new Date().toISOString(),
  };
  console[STREAM[level]](JSON.stringify(entry));
}

export const logger = {
  info: (message: string, fields?: Fields) => write('info', message, fields),
  warn: (message: string, fields?: Fields) => write('warn', message, fields),
  error: (message: string, fields?: Fields) => write('error', message, fields),
};
