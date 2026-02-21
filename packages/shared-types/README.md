# @obsidian-workspace/shared-types

Obsidian workspace 프로젝트 간 공유 TypeScript 타입 정의 패키지

## 설치

```bash
npm install @obsidian-workspace/shared-types
```

## 사용법

```typescript
import type {
  FileInfo,
  SearchResult,
  TagInfo,
  Command,
} from '@obsidian-workspace/shared-types';
```

## 타입 카테고리

### Vault 타입
파일/폴더 관련 타입

| 타입 | 설명 |
|------|------|
| `FileInfo` | 파일 정보 (경로, 이름, 확장자, 크기, 수정일) |
| `FolderInfo` | 폴더 정보 |
| `VaultListResult` | Vault 목록 조회 결과 |
| `FileMetadata` | 파일 메타데이터 (frontmatter, 태그, 링크) |
| `LinkInfo` | 파일 간 링크 정보 |

### Search 타입
검색 관련 타입

| 타입 | 설명 |
|------|------|
| `SearchResult` | 검색 결과 |
| `SearchMatch` | 검색 매치 정보 (컨텍스트, 위치) |
| `DataviewResult` | Dataview 쿼리 결과 |
| `JsonLogicResult` | JsonLogic 쿼리 결과 |

### Metadata 타입
메타데이터 관련 타입

| 타입 | 설명 |
|------|------|
| `TagInfo` | 태그 정보 (이름, 사용 횟수) |

### Commands 타입
명령어 관련 타입

| 타입 | 설명 |
|------|------|
| `Command` | Obsidian 명령어 정보 (ID, 이름) |

### Batch 타입
배치 작업 관련 타입

| 타입 | 설명 |
|------|------|
| `BatchReadResult` | 배치 읽기 결과 |
| `BatchWriteResult` | 배치 쓰기 결과 |
| `BatchDeleteResult` | 배치 삭제 결과 |

### Operations 타입
파일 조작 관련 타입

| 타입 | 설명 |
|------|------|
| `PatchOperation` | PATCH 작업 종류 (append, prepend, replace) |
| `PatchTargetType` | 대상 타입 (heading, block, line) |
| `HeadingInfo` | 헤딩 정보 (레벨, 텍스트, 범위) |

### Periodic Notes 타입
주기 노트 관련 타입

| 타입 | 설명 |
|------|------|
| `PeriodicNotePeriod` | 주기 종류 (daily, weekly, monthly, etc.) |
| `PeriodicNoteDate` | 날짜 지정 (year, month, day) |

### Graph 타입
그래프 관련 타입

| 타입 | 설명 |
|------|------|
| `HubInfo` | 허브 노트 정보 (링크 수) |

## 빌드

```bash
npm run build
```

## 라이선스

MIT
