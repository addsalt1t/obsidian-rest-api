/**
 * 로그 레벨 기반 로거 유틸리티
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

// 기본 로그 레벨 (환경변수로 override 가능, 잘못된 값은 'info'로 fallback)
const envLevel = process.env.LOG_LEVEL as string | undefined;
const currentLevel: LogLevel =
  envLevel && envLevel in LOG_LEVELS ? (envLevel as LogLevel) : 'info';

interface Logger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

/**
 * 네임스페이스 기반 로거 생성
 * @param namespace 로그 출처 식별자 (예: 'CORS', 'Search', 'Auth')
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
