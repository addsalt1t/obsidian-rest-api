# obsidian-extended-rest-api

Obsidian REST API 확장 플러그인 (Express 기반)

## 명령어

```bash
npm test -w obsidian-extended-rest-api              # 유닛 테스트
npm run test:coverage -w obsidian-extended-rest-api  # 커버리지 측정
npm run build:api                                    # 빌드 (루트에서 실행)
```

## 아키텍처

```
src/
├── routes/            # Express 라우트 핸들러 (thin layer, 27파일)
│   ├── vault.ts, active.ts, batch.ts, periodic.ts, periodic-context.ts
│   ├── search.ts, metadata.ts, tags.ts, graph.ts, commands.ts
│   ├── dataview.ts, autolink.ts, vector.ts
│   ├── vault/handlers/    # vault 읽기/쓰기/패치 세부 핸들러
│   │   └── tree.ts, utils.ts
│   └── openapi/           # OpenAPI 스펙 (9개 모듈)
├── services/          # 비즈니스 로직 (22파일)
│   ├── autolink/          # Autolink 서비스 (6파일, 614 LOC)
│   ├── vector/            # Vector 서비스 (8파일, 574 LOC)
│   ├── tagCache.ts        # 이벤트 기반 태그 캐시
│   ├── backlinkCache.ts   # 이벤트 기반 백링크 캐시
│   ├── fileListCache.ts   # 파일 목록 캐시
│   ├── filePatching.ts    # 헤딩/블록/라인 패칭 (458 LOC)
│   ├── dataviewQuery.ts   # Dataview 쿼리 실행
│   ├── yaml-formatter.ts  # YAML 포맷팅
│   └── markdownParser.ts  # 마크다운 파싱
├── middleware/         # Express 미들웨어
│   ├── asyncHandler.ts    # 에러 자동 위임 (.catch(next))
│   ├── auth.ts            # Bearer 토큰 인증
│   └── error.ts           # 에러 응답 포맷팅 (ApiError → 코드별 응답)
├── utils/             # 유틸리티 (16파일)
│   ├── response-builders.ts   # buildNoteJsonResponse(), buildMetadataResponse()
│   ├── request-parsers.ts     # parsePagination(), parseStringParam()
│   ├── file-helpers.ts        # resolveSafeFilePath()
│   ├── batch-validation.ts    # validateBatchArray()
│   ├── patch-dispatcher.ts    # dispatchPatch()
│   ├── patch-request.ts       # PATCH 요청 파싱
│   ├── metadata-ready.ts      # waitForMetadataReady()
│   ├── errors.ts              # ApiError 정의
│   └── batch-helpers.ts, concurrency.ts, content.ts, crypto.ts, regex.ts, path-validation.ts, path-scope.ts, logger.ts
├── server.ts, main.ts, settings.ts, constants.ts
```

## 필수 패턴

라우트 핸들러 작성 시 반드시 따라야 하는 패턴:

| 패턴 | 유틸리티 | 설명 |
|------|---------|------|
| 에러 핸들링 | `asyncHandler` | 라우트를 래핑 → try-catch 불필요 |
| 요청 파라미터 | `parseStringParam()` 등 | `as string` 금지, 타입 안전 함수 사용 |
| 노트 JSON 응답 | `buildNoteJsonResponse()` | 통합 노트 응답 빌더 |
| 파일 경로 검증 | `resolveSafeFilePath()` | validatePath + ensureMarkdownPath + getFileOrNull 통합 |
| PATCH 분기 | `dispatchPatch()` | targetType별 분기 로직 통합 |
| 배치 검증 | `validateBatchArray()` | 크기/빈배열 검증 통합 |
| 페이지네이션 | `parsePagination()` | limit/offset 파싱 통합 |
| 메타데이터 응답 | `buildMetadataResponse()` | 메타데이터 추출 통합 |

## 서비스 서브도메인

### Autolink (6파일, 610 LOC)
- `autolink-service.ts`: scan, linkify, extractEntitiesFromPaths
- `scan-engine.ts`: 엔티티 스캔 엔진
- `entity-extractor.ts`: 파일에서 엔티티 추출
- `matcher.ts`: 패턴 매칭

### Vector (8파일, 557 LOC)
- `vector-service.ts`: embed, vectorSearch, TF-IDF
- `cache.ts`: 임베딩 캐시
- `scope.ts`: 검색 스코프 관리
- `tfidf.ts`: TF-IDF 알고리즘

## 캐시 아키텍처

3개 이벤트 기반 싱글톤 캐시:
- `tagCache.ts`: vault + metadataCache 이벤트 → 즉시 무효화
- `backlinkCache.ts`: vault + metadataCache + resolved 이벤트
- `fileListCache.ts`: vault 이벤트 기반

**이벤트 리스너**: `vault.on`, `vault.offref`, `metadataCache.on`, `metadataCache.offref`

## OpenAPI 스펙

9개 모듈로 분할 (`routes/openapi/`):
- `base.ts`: 공유 스키마
- `common.ts`: 공통 응답/파라미터 스키마
- `paths-vault.ts`, `paths-batch.ts`, `paths-search.ts`, `paths-metadata.ts`, `paths-graph.ts`, `paths-other.ts`: 엔드포인트별
- `index.ts`: 합성

새 API 추가 시 해당 paths 파일에 추가

## REST API 참조

- Swagger UI: `https://127.0.0.1:27125/docs`
- OpenAPI 스펙: `https://127.0.0.1:27125/openapi.json`

## Gotchas

- 라우트 핸들러에 try-catch 금지 — `asyncHandler`가 `.catch(next)`로 위임, `errorHandler`가 응답
- `req.params.xxx as string` 금지 — `request-parsers.ts`의 타입 안전 함수 사용
- Route test는 반드시 `createRouterTestApp()` 사용 — errorHandler 포함 (없으면 에러 응답 검증 불가)
- `instanceof TFile` mock에서 동작 안 함 — duck typing (`'extension' in file`) 사용
- `tagCache`/`backlinkCache` 싱글톤 — 테스트 시 `beforeEach`에서 `disposeXxxCache()` 호출 필수
- 캐시 mock App은 `vault.on`/`vault.offref`/`metadataCache.on`/`metadataCache.offref` 필요
- `waitForMetadataReady()` — 파일 move/rename 후 metadataCache 재색인 대기
- `errorHandler` — ApiError는 코드(INTERNAL_ERROR 등)로 응답, 일반 Error는 'Internal server error'로 마스킹
