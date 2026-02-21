/**
 * Log level-based logger utility
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

// Default log level (can be overridden via environment variable; invalid values fall back to 'warn')
const envLevel = process.env.LOG_LEVEL as string | undefined;
const currentLevel: LogLevel =
  envLevel && envLevel in LOG_LEVELS ? (envLevel as LogLevel) : 'warn';

interface Logger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

/**
 * Create a namespace-based logger
 * @param namespace - Log source identifier (e.g., 'CORS', 'Search', 'Auth')
 */
export function createLogger(namespace: string): Logger {
  const prefix = `[${namespace}]`;

  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
  };

  return {
    debug: (message: string, ...args: unknown[]) => {
      if (shouldLog('debug')) {
        console.debug(prefix, message, ...args);
      }
    },
    info: (message: string, ...args: unknown[]) => {
      if (shouldLog('info')) {
        console.log(prefix, message, ...args);
      }
    },
    warn: (message: string, ...args: unknown[]) => {
      if (shouldLog('warn')) {
        console.warn(prefix, message, ...args);
      }
    },
    error: (message: string, ...args: unknown[]) => {
      if (shouldLog('error')) {
        console.error(prefix, message, ...args);
      }
    },
  };
}
