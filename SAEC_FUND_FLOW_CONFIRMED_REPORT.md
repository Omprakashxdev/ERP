# SAEC ERP — Confirmed Fund Flow Requirements: Implementation Report

Source: `ERP - Work Flow Formats.xlsx`, worksheet `Fund Flow` (the `(1)` filename resolves to the identical file — sha256 `b5d9f091…`, verified byte-equal to `docs/ERP - Work Flow Formats.xlsx`).
HEAD at start: `d9bcc8a` · branch `main` · no production writes, no deployment, no push.

## Confirmed fields implemented

| Excel heading | Implementation |
|---|---|
| `Region Name` / `Client Name` / `Project Name` | existing project fields (unchanged) |
| `Date of Work Order` | `Project.workOrderDate`, manual, label updated |
| `Time Limit (in Month)` | `Project.timeLimitMonths`, manual, exact Excel label |
| `Grace period` | `Project.additionalTimeMonths` relabelled; manual — the previous invented `TL×0.5` default removed (defaults to 0) |
| `Stipulated Date of Completion` | automatic = WO + TL×30.416d (`addExcelMonths`); read-only in UI |
| `Target Date of Completion` | automatic = WO + (TL+Grace)×30.416d; read-only in UI |
| `Target Time Limit (In Month)` | automatic = TL + Grace; read-only in UI |
| `Team Leader/Project Manager`, `Residential Engineer`, `Design Engineer`, `Site Engineer`, `Misc Exp` | **new** `FundFlow` columns (Decimal 19,2) |
| `Staff Exp.` | read-only, server-computed = sum of the five components |
| `Total Project Cost`, `completed work amt` | existing `FundFlow` fields, exact Excel labels |
| `remaining work amt` | read-only = Total Project Cost − completed work amt |
| `Fee percentage` | **new** `FundFlow.feePercentage` Decimal(10,6), manual |
| `Total Fee ` | `Project.totalFee` synced server-side = cost × pct/100 (exact Decimal) |
| `Proposed / Due Bill Amount` | existing field, exact Excel label |
| `fee recvd` | existing `feeReceived`, exact Excel label |
| `remaing fee` | read-only = Total Fee − fee recvd (Proposed/Due not subtracted) |
| `Start month` | **new** `FundFlow.distributionStart{Month,Year}`; drives initial remaing-fee distribution over `targetTimeLimitMonths` consecutive months (6dp stored); months outside the Apr 2026–Mar 2028 grid are skipped and counted (`skippedOutsideWindow`), never silently dropped |
| `Total Income per Month` | report heading + `Total Income` scope button (sums saved allocations across all projects); `Project Wise` kept |

## First-row Excel parity (verified)

WO 2026-04-01 · TL 12 · Grace 6 → Stipulated **2027-03-31** · Target **2027-09-30** · TTL **18** ✓
Staff Exp 0.50+0.40+0.30+0.35+0.05 = **1.60** ✓ · remaining work 22000−15000 = **7000** ✓
Total Fee 22000×0.22727/100 = **49.9994** stored exact, displays ₹50.00 ✓
remaing fee 49.9994−0/10 = **49.9994 / 39.9994** ✓
Start Jul 2026 → **18 allocations @ 2.777744, Jul 2026 → Dec 2027**; residual **0.000008** returned in result ✓

## Files changed

- `prisma/schema.prisma` — 7 additive `FundFlow` columns
- `prisma/migrations/20261022093000_fund_flow_confirmed_fields/migration.sql` — additive, defaults only, NULL for fields not to be invented
- `src/lib/date-utils.ts` — `addExcelMonths` (confirmed 30.416 method)
- `src/lib/fund-flow-calcs.ts` — new pure calc helpers
- `src/lib/actions/project.ts` — Excel date method; no invented grace default
- `src/lib/actions/fund-flow.ts` — server-computed staffExp, fee%→totalFee sync, Start-month initial distribution (never silently regenerates)
- `src/lib/schemas/fund-flow.ts` — new fields
- `src/app/dashboard/fund-flow/fund-flow-form.tsx` — Excel-order fields, computed read-only cells, exact decimal preview
- `src/app/dashboard/fund-flow/project-form.tsx` — Excel labels, Grace period manual, auto target/stipulated/target-date read-only with change-aware recompute
- `src/app/dashboard/fund-flow/monthly-income-summary.tsx` — `Total Income`/`Total Income per Month` labels
- Tests: `fund-flow-confirmed.test.ts` (9), `fund-flow-issuance.int.test.ts` (5)

## Preservation & compatibility

- All new columns `DEFAULT 0` or `NULL`; nothing renumbered/recalculated for existing rows.
- `staffExp` is only recomputed when a component field is supplied — a legacy record's stored total survives unrelated saves.
- `totalFee` only re-synced when `feePercentage` is provided.
- Initial distribution runs only when Start month set AND zero saved allocations — later edits never regenerate; the existing preview/confirm replace flow remains for explicit regeneration.
- Rows 14/16/18 (expense/net/running-balance) untouched; no new business logic there.
- Migration NOT applied to any existing database — rehearsed on disposable `saec_erp_fundflow_test` via `prisma migrate deploy`.

## Test results

- `fund-flow-confirmed.test.ts`: 9/9 — date method, staff sum, remaining work, fee 49.9994, remaing fee, monthly 2.777744 + residual 0.000008
- `fund-flow-issuance.int.test.ts` (disposable DB): 5/5 — components stored, staffExp=1.6, totalFee synced, 18 Jul 2026→Dec 2027 allocations, fee-recvd edit leaves allocations unchanged, no silent regeneration
- Full suite: 446 passed, 24 skipped · tsc 0 · lint 0 · build ✓
- Browser (disposable instance): form fields render per Excel order; Staff Exp. auto 1.60; Total Fee preview ₹49.9994; save → DB: staffExp 1.6, feePct 0.22727, totalFee 49.9994, 18 monthly rows; table displays ₹50.00; Total Income/Project Wise toggle + `Total Income per Month` heading verified (screenshots `qa-shots/ff-*.png`)

## Remaining clarifications (reported, not guessed)

- Business classification of the five Staff Exp. components is still pending customer clarification (workbook gives no units).
- Row 14/16/18 semantics remain unconfirmed — existing expense/net/balance displays unchanged.
- The legacy manual `totalFee` input on the Project form still exists for records without a fee percentage.
- Migration `20261022093000_fund_flow_confirmed_fields` requires explicit approval before applying to `saec_erp` on `45.113.226.115`.
