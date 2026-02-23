/**
 * Vault API 관련 타입 정의
 */

/** 파일 정보 */
export interface FileInfo {
  /** Vault 루트 기준 파일 경로 */
  path: string;
  /** 확장자 제외 파일명 */
  name: string;
  /** 파일 확장자 (예: "md") */
  extension: string;
  /** 파일 크기 (바이트) */
  size: number;
  /** 생성 시간 (Unix timestamp) */
  ctime: number;
  /** 수정 시간 (Unix timestamp) */
  mtime: number;
}

/** 폴더 정보 */
export interface FolderInfo {
  /** Vault 루트 기준 폴더 경로 */
  path: string;
  /** 폴더 이름 */
  name: string;
  /** 하위 항목 경로 목록 */
  children: string[];
}

/**
 * 폴더 트리 구조 (재귀적)
 * vault.tree() API에서 반환하는 계층적 폴더 구조
 */
export interface FolderTree {
  /** Vault 루트 기준 폴더 경로 */
  path: string;
  /** 폴더 이름 */
  name: string;
  /** 이 폴더에 직접 포함된 파일들 */
  files: FileInfo[];
  /** 하위 폴더들 (재귀 구조) */
  folders: FolderTree[];
}

/** 볼트 트리 조회 응답 */
export interface VaultTreeResponse {
  /** 루트부터 시작하는 전체 트리 구조 */
  tree: FolderTree;
}

/** 폴더 목록 조회 결과 */
export interface VaultListResult {
  /** 파일 목록 */
  files: FileInfo[];
  /** 폴더 목록 */
  folders: FolderInfo[];
}

/** 볼트 전체 통계 정보 */
export interface VaultInfo {
  /** 볼트 이름 */
  name: string;
  /** 총 파일 수 */
  fileCount: number;
  /** 총 폴더 수 */
  folderCount: number;
}

/** 파일 작업 결과 */
export interface FileOperationResult {
  /** 대상 파일 경로 */
  path: string;
  /** 생성 여부 */
  created?: boolean;
  /** 수정 여부 */
  updated?: boolean;
  /** 삭제 여부 */
  deleted?: boolean;
}

/** 폴더 작업 결과 */
export interface FolderOperationResult {
  /** 대상 폴더 경로 */
  path: string;
  /** 생성 여부 */
  created?: boolean;
  /** 삭제 여부 */
  deleted?: boolean;
}

/** 이동/이름 변경 결과 */
export interface MoveRenameResult {
  /** 원본 경로 */
  oldPath: string;
  /** 새 경로 */
  newPath: string;
}

/** 파일 메타데이터 */
export interface FileMetadata {
  /** 파일 경로 */
  path: string;
  /** 태그 목록 */
  tags?: string[];
  /** 프론트매터 데이터 */
  frontmatter?: Record<string, unknown>;
  /** 아웃링크 목록 */
  links?: string[];
  /** @deprecated graph.getBacklinks(path) 사용 권장 */
  backlinks?: string[];
}

/** 파일 + 메타데이터 통합 타입 */
export interface FileWithMetadata {
  /** 파일 경로 */
  path: string;
  /** 파일 내용 */
  content?: string;
  /** 프론트매터 데이터 */
  frontmatter?: Record<string, unknown>;
  /** 태그 목록 */
  tags?: string[];
  /** 파일 통계 정보 */
  stat?: {
    size: number;
    ctime: number;
    mtime: number;
  };
}

/** 링크 정보 */
export interface LinkInfo {
  /** 링크 대상 경로 또는 별칭 */
  path: string;
  /** 표시 텍스트 */
  displayText?: string;
}

/** 통합 메타데이터 응답 (REST API /metadata/{path}) */
export interface UnifiedMetadata {
  /** 파일 경로 */
  path: string;
  /** 프론트매터 데이터 */
  frontmatter?: Record<string, unknown>;
  /** 태그 목록 */
  tags?: string[];
  /** 아웃링크 목록 */
  links?: LinkInfo[];
  /** 백링크 목록 (실제 데이터) */
  backlinks?: string[];
  /** 파일 통계 정보 */
  stat?: {
    size: number;
    ctime: number;
    mtime: number;
  };
}
