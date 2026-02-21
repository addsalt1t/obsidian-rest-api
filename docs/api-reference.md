# REST API Reference

Extended REST API 엔드포인트 레퍼런스

## 인증

모든 요청에 Bearer 토큰 필요:

```
Authorization: Bearer YOUR_API_KEY
```

## Vault Endpoints

### GET /vault/

루트 폴더의 파일/폴더 목록

```bash
curl -H "Authorization: Bearer $KEY" https://localhost:27125/vault/
```

### GET /vault/{path}

파일 내용 또는 폴더 목록 조회

```bash
# 파일 내용 (text/markdown)
curl -H "Authorization: Bearer $KEY" https://localhost:27125/vault/notes/daily.md

# 파일 + 메타데이터 (JSON)
curl -H "Authorization: Bearer $KEY" \
     -H "Accept: application/vnd.olrapi.note+json" \
     https://localhost:27125/vault/notes/daily.md
```

### PUT /vault/{path}

파일 생성 또는 덮어쓰기

```bash
curl -X PUT \
     -H "Authorization: Bearer $KEY" \
     -H "Content-Type: text/markdown" \
     -d "# New Note" \
     https://localhost:27125/vault/notes/new.md
```

### POST /vault/{path}

파일 끝에 내용 추가 (append)

```bash
curl -X POST \
     -H "Authorization: Bearer $KEY" \
     -d "New content to append" \
     https://localhost:27125/vault/notes/existing.md
```

### PATCH /vault/{path}

파일 부분 수정

Headers:
- `Target-Type`: 'heading' | 'block' | 'line' | 'frontmatter-key'
- `Operation`: 'append' | 'prepend' | 'replace'

```bash
# 헤딩 섹션 수정
curl -X PATCH \
     -H "Authorization: Bearer $KEY" \
     -H "Target-Type: heading" \
     -H "Operation: append" \
     -d "New content under heading" \
     "https://localhost:27125/vault/notes/doc.md?target=Tasks"

# 프론트매터 키 수정
curl -X PATCH \
     -H "Authorization: Bearer $KEY" \
     -H "Target-Type: frontmatter-key" \
     -d "completed" \
     "https://localhost:27125/vault/notes/doc.md?target=status"
```

### DELETE /vault/{path}

파일 삭제

```bash
curl -X DELETE \
     -H "Authorization: Bearer $KEY" \
     https://localhost:27125/vault/notes/to-delete.md
```

## Search Endpoints

### POST /search/simple/?query=...

텍스트 검색

```bash
curl -X POST \
     -H "Authorization: Bearer $KEY" \
     "https://localhost:27125/search/simple/?query=project&limit=10"
```

응답:
```json
{
  "results": [
    {
      "filename": "notes/project.md",
      "score": 0.85,
      "matches": [
        {
          "context": "...working on the project...",
          "match": { "start": 15, "end": 22 }
        }
      ]
    }
  ],
  "total": 42,
  "limit": 10,
  "offset": 0
}
```

### POST /search/glob/?pattern=...

Glob 패턴으로 파일 검색

```bash
curl -X POST \
     -H "Authorization: Bearer $KEY" \
     "https://localhost:27125/search/glob/?pattern=notes/**/*.md"
```

### POST /search/ (JsonLogic)

JsonLogic 쿼리로 파일 필터링

Content-Type: `application/vnd.olrapi.jsonlogic+json`

```bash
curl -X POST \
     -H "Authorization: Bearer $KEY" \
     -H "Content-Type: application/vnd.olrapi.jsonlogic+json" \
     -d '{"in": ["#project", {"var": "tags"}]}' \
     https://localhost:27125/search/
```

**JsonLogic 변수:**
- `path`: 파일 경로
- `name`: 파일 이름 (확장자 제외)
- `extension`: 확장자
- `size`: 파일 크기 (bytes)
- `ctime`: 생성 시간 (Unix timestamp)
- `mtime`: 수정 시간 (Unix timestamp)
- `tags`: 태그 배열 (예: ["#project", "#active"])
- `frontmatter`: 프론트매터 객체

**커스텀 연산자:**
- `glob`: glob 패턴 매칭 `{"glob": ["notes/**/*.md", {"var": "path"}]}`
- `regex`: 정규식 매칭 `{"regex": ["^2024-", {"var": "name"}]}`

**예시 쿼리:**

```json
// 특정 태그를 가진 파일
{"in": ["#todo", {"var": "tags"}]}

// 최근 7일 내 수정된 파일
{">": [{"var": "mtime"}, 1704067200000]}

// frontmatter.status가 "active"인 파일
{"==": [{"var": "frontmatter.status"}, "active"]}

// 복합 조건
{"and": [
  {"in": ["#project", {"var": "tags"}]},
  {"glob": ["projects/**", {"var": "path"}]}
]}
```

### POST /search/ (Dataview DQL)

Dataview DQL 쿼리 실행 (Dataview 플러그인 필요)

Content-Type: `application/vnd.olrapi.dataview.dql+txt`

```bash
curl -X POST \
     -H "Authorization: Bearer $KEY" \
     -H "Content-Type: application/vnd.olrapi.dataview.dql+txt" \
     -d 'TABLE file.mtime as Modified FROM "notes" WHERE contains(tags, "#project")' \
     https://localhost:27125/search/
```

## Graph Endpoints

### GET /graph/links/{path}

파일의 outbound 링크 조회

```bash
curl -H "Authorization: Bearer $KEY" \
     https://localhost:27125/graph/links/notes/index.md
```

응답:
```json
{
  "path": "notes/index.md",
  "links": ["notes/project-a.md", "notes/project-b.md"],
  "count": 2
}
```

### GET /graph/backlinks/{path}

파일의 백링크 조회

```bash
curl -H "Authorization: Bearer $KEY" \
     https://localhost:27125/graph/backlinks/notes/important.md
```

### GET /graph/orphans

고립 노트 조회

```bash
curl -H "Authorization: Bearer $KEY" \
     https://localhost:27125/graph/orphans
```

### GET /graph/hubs?limit=10

허브 노트 조회

```bash
curl -H "Authorization: Bearer $KEY" \
     "https://localhost:27125/graph/hubs?limit=10"
```

응답:
```json
{
  "hubs": [
    { "path": "notes/moc.md", "inlinkCount": 42 },
    { "path": "notes/index.md", "inlinkCount": 35 }
  ]
}
```

## Batch Endpoint

### POST /batch

여러 파일을 한 번에 조회

```bash
curl -X POST \
     -H "Authorization: Bearer $KEY" \
     -H "Content-Type: application/json" \
     -d '{"paths": ["notes/a.md", "notes/b.md", "notes/c.md"]}' \
     https://localhost:27125/batch
```

응답:
```json
{
  "results": [
    {
      "path": "notes/a.md",
      "content": "# Note A\n...",
      "frontmatter": { "title": "Note A" },
      "tags": ["#tag1"]
    },
    {
      "path": "notes/b.md",
      "error": "File not found"
    }
  ],
  "success": 2,
  "failed": 1
}
```

## Commands Endpoints

### GET /commands

사용 가능한 명령어 목록

```bash
curl -H "Authorization: Bearer $KEY" \
     https://localhost:27125/commands
```

### POST /commands/{commandId}

명령어 실행

```bash
curl -X POST \
     -H "Authorization: Bearer $KEY" \
     https://localhost:27125/commands/editor:toggle-bold
```

**차단된 명령어:** 보안상 위험한 명령어는 실행이 차단됩니다 (예: `app:delete-vault`)

## Active File Endpoints

### GET /active

현재 활성 파일 조회

```bash
curl -H "Authorization: Bearer $KEY" \
     https://localhost:27125/active
```

### PUT /active

활성 파일 덮어쓰기

### POST /active

활성 파일에 내용 추가

### PATCH /active

활성 파일 부분 수정 (vault PATCH와 동일한 헤더 사용)

## Periodic Notes Endpoints

### GET /periodic/{period}

주기 노트 조회

- `period`: daily | weekly | monthly | quarterly | yearly

```bash
# 오늘의 일간 노트
curl -H "Authorization: Bearer $KEY" \
     https://localhost:27125/periodic/daily

# 특정 날짜
curl -H "Authorization: Bearer $KEY" \
     "https://localhost:27125/periodic/weekly?date=2024-01-15"
```

### PUT /periodic/{period}

주기 노트 생성/덮어쓰기

### POST /periodic/{period}

주기 노트에 내용 추가

### PATCH /periodic/{period}

주기 노트 부분 수정

## Tags Endpoint

### GET /tags

볼트의 모든 태그 목록

```bash
curl -H "Authorization: Bearer $KEY" \
     https://localhost:27125/tags
```

응답:
```json
{
  "tags": [
    { "tag": "#project", "count": 15 },
    { "tag": "#todo", "count": 8 }
  ]
}
```

## 에러 응답

```json
{
  "error": "NOT_FOUND",
  "message": "File not found",
  "details": { "path": "notes/missing.md" }
}
```

HTTP Status Codes:
- 200: 성공
- 201: 생성됨
- 400: 잘못된 요청
- 401: 인증 필요
- 403: 권한 없음 (차단된 명령어 등)
- 404: 찾을 수 없음
- 409: 충돌 (이미 존재)
- 500: 서버 에러
