/**
 * Commands API 관련 타입 정의
 */

/** Obsidian 명령어 */
export interface Command {
  /** 명령어 고유 ID */
  id: string;
  /** 명령어 표시 이름 */
  name: string;
}
