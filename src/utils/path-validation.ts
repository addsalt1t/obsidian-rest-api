/**
 * Path traversal 검증 유틸리티
 * Vault 외부 접근을 방지하기 위한 경로 검증
 */

/**
 * 경로가 path traversal 공격을 시도하는지 검사
 * @param path - 검사할 경로
 * @returns 안전한 경로면 true
 */
export function isSafePath(path: string): boolean {
  // 빈 경로는 안전 (루트)
  if (!path || path === '/') {
    return true;
  }

  // Unix 절대 경로 차단 (슬래시로 시작)
  if (path.startsWith('/')) {
    return false;
  }

  // Windows 절대 경로 차단 (드라이브 문자)
  if (/^[A-Za-z]:/.test(path)) {
    return false;
  }

  // null 바이트 차단 (파일시스템 취약점)
  if (path.includes('\0')) {
    return false;
  }

  // 경로 세그먼트 분석
  const segments = path.split(/[/\\]/);

  for (const segment of segments) {
    // 빈 세그먼트 (연속 슬래시 또는 앞뒤 슬래시) - 허용
    if (!segment) continue;

    // 상위 디렉토리 참조 차단
    if (segment === '..' || segment === '...' || segment.includes('..')) {
      return false;
    }

    // Windows 특수 장치 이름 차단
    const windowsReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
    const baseSegment = segment.split('.')[0];
    if (windowsReserved.test(baseSegment)) {
      return false;
    }
  }

  return true;
}

/**
 * 경로를 검증하고 안전하지 않으면 에러 throw
 * @param path - 검사할 경로
 * @throws {PathValidationError} 안전하지 않은 경로인 경우
 */
export function validatePath(path: string): void {
  if (!isSafePath(path)) {
    throw new PathValidationError(path);
  }
}

/**
 * 경로 검증 에러
 */
export class PathValidationError extends Error {
  public readonly path: string;
  public readonly statusCode = 400;

  constructor(path: string) {
    super('Invalid path: contains path traversal sequences or invalid characters');
    this.name = 'PathValidationError';
    this.path = path; // Keep for internal logging only
  }
}
