# Korean Autolink Safety Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve Korean autolink safety by preventing internal substring matches, covering core particles, and enforcing high-confidence-only application even when `autoConfirm=true`.

**Architecture:** Keep the existing regex-first pipeline, but harden the regex boundary checks and particle list. Preserve API compatibility by keeping the `autoConfirm` field while changing behavior to high-confidence-only in link application logic.

**Tech Stack:** TypeScript, Vitest, existing autolink service internals.

---

### Task 1: Add failing tests for Korean safety rules

**Files:**
- Modify: `tests/unit/services/autolink-service.test.ts`

**Step 1: Write failing tests**
- Add a `buildEntityPattern` test verifying `buildEntityPattern('철수')` does not match `"김철수는 출정했다"`.
- Add a `buildEntityPattern` test verifying `buildEntityPattern('진')` matches `"진에 갔다"` and captures particle `"에"`.
- Add a `scan` test verifying entity `"진"` does not match inside `"이루어진 계획"`.
- Add a `linkify` test verifying `autoConfirm: true` does not apply medium-confidence alias matches.

**Step 2: Run targeted tests to verify RED**
- Run: `npm test -- tests/unit/services/autolink-service.test.ts`
- Expected: New tests fail before implementation.

### Task 2: Implement matcher and confidence gate hardening

**Files:**
- Modify: `src/services/autolink/constants.ts`
- Modify: `src/services/autolink/matcher.ts`
- Modify: `src/services/autolink/scan-engine.ts`

**Step 1: Harden regex boundaries**
- Add a strict left boundary check for Korean/English/number word chars in `buildEntityPattern`.
- Keep existing wikilink guards.

**Step 2: Expand core Korean particles**
- Add missing core particles (`을`, `에`) and keep existing particles.

**Step 3: Enforce high-only auto application**
- Change linkify apply condition to enforce `confidence === 'high'` even when `autoConfirm` is true.
- Keep `autoConfirm` parameter for wire compatibility.

### Task 3: Update API description to reflect behavior

**Files:**
- Modify: `src/routes/openapi/paths-other.ts`
- Modify: `packages/shared-types/src/autolink.ts`

**Step 1: Update `autoConfirm` description**
- Clarify that for safety only high-confidence matches are auto-applied.

### Task 4: Verify and finalize

**Files:**
- Verify: `tests/unit/services/autolink-service.test.ts`

**Step 1: Run verification**
- Run: `npm test -- tests/unit/services/autolink-service.test.ts`
- Expected: PASS.

**Step 2: Optional broader verification**
- Run: `npm test -- tests/unit/routes/autolink.test.ts`
- Expected: PASS.
