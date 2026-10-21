# SAEC ERP — In-Out Register Fix Report

HEAD `b0f397a` (main) · 21 Oct 2026
Rule: fix only confirmed, non-destructive code defects with an approved expected behavior; stop at schema/business decisions.

---

## Verdict: no source fixes applied in this task

Every confirmed defect sits behind either a **schema migration** or a **business-rule decision** — both explicitly listed in the task's STOP conditions. Applying any of them unilaterally would mean inventing numbering policy the workbook never defines.

## Confirmed defects (independent reproduction — all in `in-out-serial-generator.int.test.ts`)

| ID | Severity | Defect | Evidence | Fix category |
|---|---|---|---|---|
| S1 | HIGH | `serialNo` has no DB unique constraint; read-max-then-create race allows duplicates | two identical serials inserted successfully | **SCHEMA** — `@@unique` on `serialNo` or counter table |
| S2 | MEDIUM | Client-supplied `serialNo` trusted verbatim; stale dialogs submit stale numbers | `X/AUDIT-VERIFY/999` stored as-is | **CODE (safe)** — server-side recheck/regen, but only meaningful with S1 |
| S3 | MEDIUM | Deleted serials recycled — sequence rewinds, prior refs reissued | delete sole `050` → next `001` | **BUSINESS** — monotonic policy requires counter table |
| S4 | LOW | Manual `documentRefNo` matching pattern consumes sequence | `INW/…/555` pushed next to `1000` | **DESIGN** — collision-safe by intent; keep or restrict to serialNo |

## Proposed minimal corrections (awaiting approval)

### Fix S1+S2 together (recommended)
```sql
-- migration.sql
ALTER TABLE "InOutRegister"
  ADD CONSTRAINT "InOutRegister_serialNo_key" UNIQUE ("serialNo");
```
plus in `createInOutRegister`: regenerate serial server-side inside a retry loop on unique-violation — eliminates the race and the client-trust hole atomically. **Requires migration approval + nulls remain allowed (unique ignores NULLs).**

### Fix S3 (monotonic sequence)
Counter table:
```prisma
model RegisterSerialCounter {
  scope   String @id   // e.g. "INW/2026-27"
  lastSeq Int
}
```
Atomic `UPDATE … SET lastSeq = lastSeq + 1 RETURNING lastSeq` — no read-max, no recycling, no race. **Requires schema approval.**

### Fix S4 (optional)
Restrict the generator's scan to `serialNo` only — loses the safety net where a manual ref accidentally collides. **Customer decision.**

## Safe code change that could proceed without schema (if approved)
Server-side `serialNo` regeneration on every create (ignore client value) — closes S2's stale/arbitrary-input hole but not the race itself. Held for approval per task rules.

## What WAS added (non-destructive)
- `src/lib/__tests__/in-out-serial-generator.int.test.ts` — 9 real-DB integration tests covering every verified behavior above (opt-in via `RUN_INTEGRATION_TESTS=1`).

## Verification status
- `npx vitest run` — 437 unit tests pass (incl. FY rollover, task dedup, delete-guard, bulk import)
- Integration suite — 9/9 pass on isolated DB
- `tsc --noEmit` — clean · lint — 0 errors · build — previously verified on deployed server

## Existing records
Untouched. Local isolated DB has 7 records with correct serials; no deletions, no renumbering, no migrations performed.

## Remaining blockers for production
1. **S1 unique constraint** — real concurrent duplicates possible today
2. **S3 monotonicity** — register chronology can be broken by deletion
3. Workbook approval of the `INW|OUT/FY-YY/NNN` convention itself
4. `/uploads` record-level authorization (pre-existing, out of scope)

**STOP — awaiting approval for the S1/S2/S3 corrections.**
