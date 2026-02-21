import { describe, it, expect } from 'vitest';
import { isBlockedCommand, BLOCKED_COMMANDS, BLOCKED_COMMAND_PATTERNS } from '../../src/constants';

describe('isBlockedCommand', () => {
  describe('blocked commands', () => {
    it('should block dangerous vault commands', () => {
      expect(isBlockedCommand('app:delete-vault')).toBe(true);
      expect(isBlockedCommand('file-recovery:open')).toBe(true);
    });

    it('should block all commands in BLOCKED_COMMANDS', () => {
      for (const cmd of BLOCKED_COMMANDS) {
        expect(isBlockedCommand(cmd)).toBe(true);
      }
    });

    it('should block commands matching BLOCKED_COMMAND_PATTERNS', () => {
      // app:delete 패턴
      expect(isBlockedCommand('app:delete-something-new')).toBe(true);
      // file-recovery: 패턴
      expect(isBlockedCommand('file-recovery:new-feature')).toBe(true);
      // delete-vault 패턴
      expect(isBlockedCommand('custom:delete-vault-data')).toBe(true);
      // obsidian-sync: 패턴
      expect(isBlockedCommand('obsidian-sync:new-sync-feature')).toBe(true);
      // publish: 패턴
      expect(isBlockedCommand('publish:new-feature')).toBe(true);
    });
  });

  describe('allowed commands', () => {
    it('should allow safe commands', () => {
      expect(isBlockedCommand('editor:toggle-bold')).toBe(false);
      expect(isBlockedCommand('editor:toggle-italic')).toBe(false);
      expect(isBlockedCommand('workspace:close')).toBe(false);
      expect(isBlockedCommand('workspace:split-vertical')).toBe(false);
    });

    it('should allow commands with similar prefixes', () => {
      // "app:" prefix but not blocked
      expect(isBlockedCommand('app:show-vault-name')).toBe(false);
      // "file-explorer:" prefix but not blocked (new-file is safe)
      expect(isBlockedCommand('file-explorer:new-file')).toBe(false);
    });

    it('should handle empty and invalid inputs', () => {
      expect(isBlockedCommand('')).toBe(false);
      expect(isBlockedCommand('nonexistent-command')).toBe(false);
    });
  });
});

describe('BLOCKED_COMMANDS', () => {
  it('should be a non-empty array', () => {
    expect(Array.isArray(BLOCKED_COMMANDS)).toBe(true);
    expect(BLOCKED_COMMANDS.length).toBeGreaterThan(0);
  });

  it('should contain string command IDs', () => {
    for (const cmd of BLOCKED_COMMANDS) {
      expect(typeof cmd).toBe('string');
      expect(cmd.length).toBeGreaterThan(0);
    }
  });
});

describe('BLOCKED_COMMAND_PATTERNS', () => {
  it('should be a non-empty array of RegExp', () => {
    expect(Array.isArray(BLOCKED_COMMAND_PATTERNS)).toBe(true);
    expect(BLOCKED_COMMAND_PATTERNS.length).toBeGreaterThan(0);
    for (const pattern of BLOCKED_COMMAND_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp);
    }
  });
});
