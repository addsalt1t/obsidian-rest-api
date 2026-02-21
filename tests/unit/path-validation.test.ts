import { describe, it, expect } from 'vitest';
import { isSafePath, validatePath, PathValidationError } from '../../src/utils/path-validation';

describe('isSafePath', () => {
  describe('safe paths', () => {
    it('should accept empty path (root)', () => {
      expect(isSafePath('')).toBe(true);
      expect(isSafePath('/')).toBe(true);
    });

    it('should accept simple file paths', () => {
      expect(isSafePath('file.md')).toBe(true);
      expect(isSafePath('folder/file.md')).toBe(true);
      expect(isSafePath('a/b/c/d.md')).toBe(true);
    });

    it('should accept paths with dots in names', () => {
      expect(isSafePath('file.name.md')).toBe(true);
      expect(isSafePath('folder.name/file.md')).toBe(true);
    });

    it('should accept paths with spaces', () => {
      expect(isSafePath('my folder/my file.md')).toBe(true);
    });

    it('should accept paths with unicode characters', () => {
      expect(isSafePath('한글/파일.md')).toBe(true);
      expect(isSafePath('日本語/ファイル.md')).toBe(true);
    });

    it('should accept single dot in path', () => {
      expect(isSafePath('./file.md')).toBe(true);
      expect(isSafePath('folder/./file.md')).toBe(true);
    });
  });

  describe('unsafe paths - path traversal', () => {
    it('should reject parent directory traversal', () => {
      expect(isSafePath('..')).toBe(false);
      expect(isSafePath('../')).toBe(false);
      expect(isSafePath('../file.md')).toBe(false);
      expect(isSafePath('folder/../file.md')).toBe(false);
      expect(isSafePath('a/b/../../c.md')).toBe(false);
    });

    it('should reject triple dot traversal', () => {
      expect(isSafePath('...')).toBe(false);
      expect(isSafePath('.../file.md')).toBe(false);
    });

    it('should reject embedded .. in segment', () => {
      expect(isSafePath('file..name.md')).toBe(false);
      expect(isSafePath('folder../file.md')).toBe(false);
    });

    it('should reject backslash path traversal', () => {
      expect(isSafePath('..\\')).toBe(false);
      expect(isSafePath('..\\file.md')).toBe(false);
      expect(isSafePath('folder\\..\\file.md')).toBe(false);
    });
  });

  describe('unsafe paths - Unix specific', () => {
    it('should reject Unix absolute paths', () => {
      expect(isSafePath('/etc/passwd')).toBe(false);
      expect(isSafePath('/home/user/.ssh/id_rsa')).toBe(false);
      expect(isSafePath('/var/log/auth.log')).toBe(false);
      expect(isSafePath('/notes/daily')).toBe(false);
    });
  });

  describe('unsafe paths - Windows specific', () => {
    it('should reject Windows absolute paths', () => {
      expect(isSafePath('C:')).toBe(false);
      expect(isSafePath('C:/')).toBe(false);
      expect(isSafePath('C:\\file.md')).toBe(false);
      expect(isSafePath('D:/folder/file.md')).toBe(false);
    });

    it('should reject Windows reserved device names', () => {
      expect(isSafePath('con')).toBe(false);
      expect(isSafePath('CON')).toBe(false);
      expect(isSafePath('prn.md')).toBe(false);
      expect(isSafePath('aux')).toBe(false);
      expect(isSafePath('nul')).toBe(false);
      expect(isSafePath('com1')).toBe(false);
      expect(isSafePath('lpt1')).toBe(false);
      expect(isSafePath('folder/con/file.md')).toBe(false);
    });
  });

  describe('unsafe paths - null byte', () => {
    it('should reject null byte injection', () => {
      expect(isSafePath('file\0.md')).toBe(false);
      expect(isSafePath('\0file.md')).toBe(false);
      expect(isSafePath('folder\0/file.md')).toBe(false);
    });
  });
});

describe('validatePath', () => {
  it('should not throw for safe paths', () => {
    expect(() => validatePath('file.md')).not.toThrow();
    expect(() => validatePath('folder/file.md')).not.toThrow();
    expect(() => validatePath('')).not.toThrow();
  });

  it('should throw PathValidationError for unsafe paths', () => {
    expect(() => validatePath('../file.md')).toThrow(PathValidationError);
    expect(() => validatePath('C:/file.md')).toThrow(PathValidationError);
    expect(() => validatePath('/etc/passwd')).toThrow(PathValidationError);
  });

  it('should include path in error property but not in message', () => {
    try {
      validatePath('../evil.md');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(PathValidationError);
      expect((e as PathValidationError).path).toBe('../evil.md');
      expect((e as PathValidationError).statusCode).toBe(400);
      // Security: error message should NOT contain user-supplied path (CWE-209)
      expect((e as PathValidationError).message).not.toContain('../evil.md');
      expect((e as PathValidationError).message).toContain('path traversal');
    }
  });
});
