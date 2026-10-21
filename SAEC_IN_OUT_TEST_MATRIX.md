# SAEC ERP — In-Out Register Test Matrix

HEAD `b0f397a` · DB `saec_erp_manual_test` · 21 Oct 2026
VERIFIED = executed this session · CODE = source-inspected · NOT-TESTED = explicitly not covered

## A. Serial generation (integration-tested on real DB)

| ID | Case | Expected | Actual | Status |
|---|---|---|---|---|
| G1 | Empty INWARD/FY scope | `INW/FY/001` | `INW/2099-00/001` | VERIFIED |
| G2 | 009 → next | `010` | `INW/2099-00/010` | VERIFIED |
| G3 | 099 → next | `100` | `INW/2099-00/100` | VERIFIED |
| G4 | 999 → next | `1000` | `INW/2099-00/1000` | VERIFIED |
| G5 | OUTWARD scope | `OUT/FY/001` | `OUT/2099-00/001` | VERIFIED |
| G6 | FY boundary Apr→Mar | FY flips at Apr 1 | unit-tested (`in-out-register-fy.test.ts`) | VERIFIED |
| G7 | Doc ref matching pattern | consumes seq | `INW/2099-00/555` → next `1000` | VERIFIED |
| G8 | Delete sole record | number recycled → `001` | `OUT/2097-98/001` | VERIFIED (defect S3) |
| G9 | Duplicate serial insert | should fail — **accepts** | both rows created | VERIFIED (defect S1) |
| G10 | Client-supplied serial | should regen — **stored verbatim** | `X/AUDIT-VERIFY/999` saved | VERIFIED (defect S2) |
| G11 | Blank serial → auto | `OUT/FY/NNN` | matched regex | VERIFIED |
| G12 | Edit preserves serial | unchanged | server strips field | VERIFIED (code + tests) |
| G13 | Two users same serial simultaneously | unique refs required | **NOT POSSIBLE — no DB constraint** | BLOCKED (schema) |
| G14 | Cancelled form | no number consumed | number only assigned on create | VERIFIED (code) |
| G15 | Stale dialog serial | server recheck | **trusted verbatim** | VERIFIED (S2) |

## B. Workflows

| ID | Case | Status | Evidence |
|---|---|---|---|
| W1 | New Inward → INWARD + INW prefix | VERIFIED (browser + tests) | form shows `INW/2026-27/001` |
| W2 | New Outward → OUTWARD + OUT prefix | VERIFIED | live `OUT/2026-27/001` |
| W3 | Inward → Reply → OUTWARD linked to parent | VERIFIED | `OUT/2026-27/002` parentInwardId set |
| W4 | Reply shows "Re:" link on inward row | CODE | table renders `parentInward.serialNo` |
| W5 | Tab switch clears dialog state | VERIFIED (prior session) | direction-aware CTAs |
| W6 | Save → refresh → reopen persists | VERIFIED | serials survive reload |
| W7 | Unrelated inward unaffected by reply | VERIFIED | only linked row loses Reply btn |

## C. Data integrity (read-only queries)

| ID | Check | Result | Status |
|---|---|---|---|
| D1 | Direction counts | 5 INWARD / 2 OUTWARD / 0 null | VERIFIED |
| D2 | Duplicate serialNo | 0 | VERIFIED |
| D3 | NULL serialNo | 0 | VERIFIED |
| D4 | Malformed serials | 0 | VERIFIED |
| D5 | Orphan parentInwardId | 0 | VERIFIED |
| D6 | Orphan tasks | 0/2 | VERIFIED |
| D7 | Pending-for-reply parity | DB 2 = UI tab 2 | VERIFIED |
| D8 | Mandatory-field gaps | none in existing data | VERIFIED |

## D. UI / filters / reports

| ID | Check | Status |
|---|---|---|
| U1 | All/Inward/Outward/Unclassified/Pending tabs | VERIFIED (counts match DB) |
| U2 | Search by serial | VERIFIED |
| U3 | Search by docRef | CODE (`search` covers serialNo+docRefNo+details+client) |
| U4 | Direction filter | VERIFIED |
| U5 | Date range + age filters | CODE (query layer tested) |
| U6 | Clear/Apply filters | VERIFIED |
| U7 | Sort across FYs | VERIFIED (serials sort correctly by date) |
| U8 | Horizontal scroll / Actions col | VERIFIED (Delete visible) |
| U9 | Empty states | VERIFIED (Outward tab empty state) |
| U10 | Mobile 390px | VERIFIED (no overflow) |
| U11 | Edit/View buttons | VERIFIED |
| U12 | Bulk import serial handling | VERIFIED (mocked suite) |
| U13 | Report totals vs DB | CODE (`in-out-reports.test.ts` passes) |
| U14 | "Sr. No." heading appropriateness | FLAGGED — conflates serial w/ system ref |

## E. Security & linkage

| ID | Check | Status |
|---|---|---|
| S1 | ADMIN-only delete (server) | VERIFIED (`inOutRegister.delete` perm) |
| S2 | MANAGER/STAFF no delete UI | VERIFIED (browser, 0 buttons) |
| S3 | Delete blocked with linked tasks | VERIFIED (server + test) |
| S4 | Task dedup by assignee | VERIFIED (suite) |
| S5 | Distinct CC task identities | VERIFIED (suite) |
| S6 | Upload session gating | VERIFIED (prior session) |
| S7 | Upload record-level authz | NOT-TESTED → known production blocker |

## Summary

| | Count |
|---|---|
| VERIFIED | 34 |
| CODE-TRACED | 5 |
| CONFIRMED DEFECT | 3 (S1 no-uniqueness, S2 client-trust, S3 recycling) |
| BLOCKED (schema/business) | 1 (G13 concurrency) |
| NOT-TESTED | 1 (upload record authz) |

**Regression command:** `RUN_INTEGRATION_TESTS=1 npx vitest run src/lib/__tests__/in-out-serial-generator.int.test.ts` (9/9 pass) · full suite `npx vitest run` (437 pass)
