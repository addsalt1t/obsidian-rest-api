# Security Response Policy Checklist

This checklist is for operating `obsidian-rest-api` with minimal sensitive-data exposure.

## 1) Production Baseline

- Set `allowSensitiveFields` to `false`.
- Set `sensitiveFieldAllowlist` to an empty string unless explicitly needed.
- Set `legacyFullResponseCompat` to `false`.

Expected default behavior with this baseline:

- `Accept: application/vnd.olrapi.note+json`
  - No sensitive fields unless explicitly requested and allowed.
- `GET /metadata/{path}`
  - No sensitive fields unless explicitly requested and allowed.
- `POST /search/simple/`
  - `context` and `offset` are treated as sensitive and require policy allowance.

## 2) Controlled Allowlist Enablement

Only enable `allowSensitiveFields=true` for trusted environments.

If enabled:

- Restrict `sensitiveFieldAllowlist` to minimal required fields.
- Re-evaluate whether each field is required by a real client use case.

Known field names:

- note+json: `content,frontmatter,tags,links,stat`
- metadata: `frontmatter,tags,links,backlinks,stat`
- search.simple: `context,offset`

## 3) Error and Logging Hygiene

- Keep path validation errors sanitized (no raw untrusted path in logs).
- Avoid logging full error objects that may include request internals.

## 4) API Contract Review

Confirm OpenAPI documents include `fields` query parameter where applicable:

- `GET /vault/{path}`
- `GET /active`
- `GET /periodic/{period}`
- `GET /metadata/{path}`
- `POST /search/simple/`

## 5) Verification Commands

Run before release:

```bash
npm test
npm run lint
npm run build
```

## 6) Rollout and Monitoring

- Deploy with strict baseline first (`allowSensitiveFields=false`).
- Watch for 403 errors caused by sensitive field requests.
- If needed, add only specific allowlist entries instead of broad enablement.
