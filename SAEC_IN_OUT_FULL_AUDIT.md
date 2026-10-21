# SAEC ERP — In-Out Register: Complete Audit

**Date:** 21 Oct 2026
**Local HEAD:** `b0f397a` (branch `main`, contains serial-number feature + admin delete)
**Workbook:** `docs/ERP - Work Flow Formats.xlsx`, sheet `in out reg gr` (SHA `b5d9f091…713e33`, authoritative)
**DB:** `saec_erp_manual_test` — isolated test database only; no production writes
**Scope:** In-Out Register module only (incl. its Tasks, Staff, document, report, import/export connections). HR excluded.

---

## 1. Workbook Comparison — the authoritative identifier model

The `in out reg gr` sheet defines these fields:

| Workbook field | Workbook rule | Implementation | Match? |
|---|---|---|---|
| Doc date | "Current date .. by default" | `documentDate`, default today | ✓ |
| Rec. Date | "Current date .. by default" | `receivedDate`, default today | ✓ |
| **Doc Ref. No** | "Write state name per documents" — e.g. `GMB/XEN/C/BVC/PB/339` — the letter's own printed ref | `documentRefNo`, free text, optional | ✓ semantics |
| From | Client master list | `clientId` FK | ✓ |
| Detail | "Refer uploaded documents" | `details` + documents | ✓ |
| CC marking | Task/reminder, staff list | `ccStaff` + linked task | ✓ |
| Action suggested | Task list, staff list | `actionSuggestedStaffId` + linked task | ✓ |
| Reply Date | "Current date .. by default" | `receivedDate` on OUTWARD reply | ✓ |
| **Reply Ref. No** | **"As per system generated"** | `serialNo` on the OUTWARD reply (`OUT/FY/NNN`) | ⚠ partial |

### Critical workbook finding
The workbook specifies **exactly one system-generated number — the Reply Ref. No** of the outward reply. It does **not** define:
- a separate inward serial number (`INW/FY/NNN`)
- an outward non-reply serial (`OUT/FY/NNN`)
- the `INW|OUT/YYYY-YY/NNN` format itself
- any financial-year component or reset rule
- a "Sr. No." table column displaying it

The implemented convention (`INW/2025-26/001`…) is internally consistent and a reasonable register practice, **but it is an implementation choice, not a workbook rule**. It must be presented to the customer as UNSUPPORTED-by-workbook pending their confirmation — it is not fabricated or wrong, it is undocumented.

### Identifier separation (verified)
| Identifier | Source | Notes |
|---|---|---|
| Internal ID | Prisma `cuid` | never shown to users |
| `serialNo` | system-generated `INW\|OUT/FY/NNN` or client-supplied | **not workbook-specified** |
| `documentRefNo` | manual, letter's own ref | matches workbook "Doc Ref. No" |
| Reply ref | `serialNo` of OUTWARD row + `parentInwardId` link | workbook's only required auto-number |

---

## 2. Implementation inventory (files audited)

| File | Role |
|---|---|
| `prisma/schema.prisma` `InOutRegister` | model — `serialNo String?`, `documentRefNo String?`, `parentInwardId`, index on `serialNo` (**no unique**) |
| `src/lib/actions/in-out-register.ts` | CRUD, `getNextRegisterRefNo`, `deleteInOutRegister`, reply/task linkage |
| `src/lib/actions/export-import.ts` | bulk import/export — serial/docRef handling |
| `src/lib/queries/in-out-register.ts` | filters, counts, tab queries |
| `src/lib/schemas/in-out-register.ts` | Zod create/update/filter |
| `src/lib/date-utils.ts` `getIndianFinancialYear` | FY = Apr–Mar, IST-safe |
| `src/app/dashboard/in-out-register/*` | page, table (5 views incl. Delete), form, tabs |
| `src/lib/actions/task-linking.ts` | linked task dedup/block-on-delete |
| `src/lib/authz.ts` | `inOutRegister` — ADMIN: all; MANAGER: create/read/update; STAFF: read/create; AUDITOR: read |

---

## 3. Serial-number deep audit — verified behavior

All results reproduced against the real isolated DB (`src/lib/__tests__/in-out-serial-generator.int.test.ts`, 9/9 pass):

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Empty scope → `001` | ✓ | `INW/2099-00/001` |
| 2 | `009→010`, `099→100`, `999→1000` | ✓ no truncation | `1000` emitted |
| 3 | INW/OUT separate scopes | ✓ | `OUT/2099-00/001` independent |
| 4 | FY = Apr–Mar (IST), docDate-derived | ✓ | existing fy tests + code |
| 5 | `serialNo` immutable on edit | ✓ | stripped in `updateInOutRegister` |
| 6 | **No DB unique constraint on `serialNo`** | ✗ CONFIRMED | two rows with identical serial inserted fine |
| 7 | **Client-supplied `serialNo` trusted verbatim** | ✗ CONFIRMED | `X/AUDIT-VERIFY/999` stored as-is |
| 8 | **Deleted numbers recycled** | ✗ CONFIRMED | sole `050` deleted → next is `001` (sequence rewinds; previously-issued refs get reissued) |
| 9 | Manual `documentRefNo` matching `INW|OUT/FY/NNN` inflates sequence | ⚠ by design | `INW/2099-00/555` counted — collision-safe but consumes numbers |

### Confirmed defects

**S1 — HIGH. No uniqueness + read-max-then-create race.**
`getNextRegisterRefNo` reads max, create writes later — TOCTOU. Two simultaneous users (or one stale dialog) can be assigned the same `serialNo`; the DB will accept both (proven, test 6). Requires a **unique constraint / serial-counter table — schema change, STOPPED for approval.**

**S2 — MEDIUM. Client-trusted serialNo.**
Form fetches the next number at mount, submits it; server uses it verbatim if non-blank (proven, test 7). Stale dialog → stale number; crafted input → arbitrary serial. Mitigation without schema: server-side re-check-and-regenerate inside the create — possible but still racy without the constraint. **Bundled with S1 decision.**

**S3 — MEDIUM. Deleted numbers are recycled.**
Deleting the current max frees its number; the sequence rewinds (proven, test 8). A deleted `OUT/2026-27/002` will have its number reissued — two different historical entries can share a reference. Monotonic counters need a separate counter record — **schema/business decision.**

**S4 — LOW. `documentRefNo` collision scan conflates two identifiers.**
Counting manual refs that look like serials prevents dup numbers but lets a user-typed ref (e.g. a genuine letter ref `INW/2026-27/999`) jump the sequence to `1000`. Rare, correct-by-design, documented.

**S5 — INFO. FY source = `documentDate` (fallback `receivedDate`).**
Workbook gives no FY rule; docDate is the defensible choice. Timezone-safe via `toInputDateIST`.

### Non-issues verified
- Edit never mutates serial (server strips it; test 5 + code line 187).
- Blank ≠ zero; blank serial → auto-generate (test 9).
- Historical numbers preserved exactly (no renumber on update/delete).
- Unclassified (null direction) records not auto-classified.
- Imported records dedup by serial/docRef (bulk-import tests pass).

---

## 4. Data integrity (isolated DB, read-only)

| Check | Result |
|---|---|
| Total records | 7 (5 INWARD, 2 OUTWARD) |
| Duplicate `serialNo` | none |
| NULL/malformed `serialNo` | none (backfilled earlier) |
| Orphan `parentInwardId` | 0 |
| Orphan linked tasks | 0/2 |
| Pending-for-reply count | 2 — matches UI tab |
| Reply linkage | `OUT/2026-27/002` → linked parent ✓ |

## 5. UI / browser verification (1366×768 + 390px, local)

| Check | Result |
|---|---|
| 7 rows ↔ 7 DB records | ✓ serials `OUT/2026-27/002`…`INW/2025-26/001` |
| Search by serial | ✓ `INW/2026-27/001` → 1 row |
| Reply buttons | 4 (4 unreplied inward — includes 2 no-deadline) ✓ consistent |
| Delete buttons | admin-visible, manager-hidden ✓ |
| Page errors | none |
| Mobile 390px overflow | none |
| "Sr. No." heading | ⚠ acceptable but conflates "serial" with system ref — customer may prefer "Register No." |

## 6. Security & linkage

- RBAC: delete = ADMIN only (server-enforced + UI-gated) ✓
- Delete blocked when linked tasks exist (server guard + test) ✓
- `documentRefNo` optional per workbook (letter may have none) ✓ — blanks allowed are workbook-consistent, not missing validation
- `/uploads` session-gated but **not record-authorized** — pre-existing production blocker (unchanged, reported)

## 7. Fixes applied in this task

**Code changes: none.** Every confirmed defect requires a schema migration or business decision (S1–S3), and the workbook does not define the serial format — changing it now would be inventing rules.
**Added:** `src/lib/__tests__/in-out-serial-generator.int.test.ts` — 9 integration tests proving the actual behavior on the real DB (skips when `RUN_INTEGRATION_TESTS` unset).

## 8. Decisions required from customer / architect

1. Is `INW|OUT/FY-YY/NNN` the approved register-number format? (workbook only requires a generated Reply Ref. No)
2. DB unique constraint on `serialNo` — approve migration?
3. Should deleted numbers be recyclable, or must the sequence be monotonic (counter table)?
4. Should the server ignore client-supplied serials for creates (server-side regen + recheck)?
5. Keep scanning `documentRefNo` for collisions (current) or restrict scan to `serialNo` only?

## 9. Release gate

**Conditional pass for demo** — all displayed values are correct, nothing fabricated, no wrong numbers anywhere; the numbering convention itself is customer-pending, and S1–S3 are release blockers for production scale-out.
