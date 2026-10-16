# SAEC ERP — FF-01A Implementation Report

## A. Git state

- **Starting branch:** `main`
- **Starting SHA:** `9fc0fdd7e77a0eb0a793a3421791da7d0ee8ea18`
- **Remote HEAD after fetch:** `9fc0fdd7e77a0eb0a793a3421791da7d0ee8ea18` (same as starting SHA)
- **Implementation branch:** `feat/fund-flow-ff01a`
- **Final SHA:** `7631cc52304383b48fd7e4d3ad3dca486ae569cf`
- **Uncommitted changes:** The working tree was clean at start (repository was cloned fresh). No existing uncommitted changes were present.

## B. Actual changes

### Files added

| File | Purpose |
|------|---------|
| `src/lib/fund-flow/reconciliation.ts` | Pure calculation layer: types, Decimal-safe helpers, discrepancy detection, and `reconcileProject()` engine. |
| `src/lib/fund-flow/reconciliation.test.ts` | Automated tests for the pure engine covering T01–T13 and T15. |
| `src/lib/actions/reconciliation.ts` | Server read action `getProjectReconciliation` with RBAC, project ID validation, Prisma fetch, and mapping to pure engine. |
| `src/lib/actions/reconciliation.test.ts` | Server action tests covering T14 (authorization) and integration mocks. |

### Diff summary
- 4 files created, 0 existing source files modified.
- `package-lock.json` changed only by the prerequisite `npm install` used to run verification gates.
- No Prisma schema or migration changes.
- No UI, deployment, or infrastructure changes.

## C. Financial calculation rules

### Contract-fee authority
- `Project.totalFee` is treated as the authoritative contract fee.
- Fee-stage allocation (`ProjectFeeStage.amount`) is summed and compared against `Project.totalFee`.
- No automatic redistribution or modification of fee stages.

### Invoice amount and GST handling
- Invoice total = `grossAmount + sgst + cgst`.
- Stored `DueBill.billAmount` is verified against this computed total; mismatches emit `CONTRADICTORY_PAYMENT_DETAILS`.
- If `grossAmount > 0` and both `sgst` and `cgst` are exactly `0`, the invoice is flagged as ambiguous GST data (`MISSING_AMBIGUOUS_SOURCE_DATA`). No universal GST rate is assumed.

### Settlement components
- Settlement total = `chequeAmount + sd + itTds`.
- Stored `DueBill.receivedAmount` is verified against this computed total; mismatches emit `CONTRADICTORY_PAYMENT_DETAILS`.
- Outstanding = `billAmount - receivedAmount` per bill, aggregated across active bills.

### Cash versus non-cash treatment
- `chequeAmount` is reported as the recorded cash component.
- `sd` (security deposit) and `itTds` (tax deduction) are non-cash deductions and are never included in cash received.
- The schema does not confirm whether `chequeAmount` represents a cleared receipt or merely an entered figure. `recordedCash.withLimitation` is `true` and carries an explicit explanation of this limitation.

### Cancelled-bill treatment
- Cancelled (`status === "CANCELLED"`) bills are excluded from active invoice/settlement totals.
- If a cancelled bill has non-zero `chequeAmount`, `receivedAmount`, `sd`, or `itTds`, a `CANCELLED_BILL_WITH_PAYMENT` discrepancy is emitted.

### WIP comparison assumptions
- WIP and FundFlow fields are semantically different and are **not** treated as equivalent.
- Compared values are reported side-by-side:
  - `wip.amountOfWorkDone`
  - `fundFlow.completedWorkAmt`
  - `project.estimatedCost`
- RA bill amounts, SAEC fees, and project expenses are summed from WIP `raBill1..4` fields.

### Decimal and rounding approach
- All monetary arithmetic uses Prisma `Decimal` via `new Decimal(value.toString())`.
- No JavaScript binary floating-point arithmetic is used for money.
- Source records are preserved exactly; no silent rounding of input amounts.
- Final aggregated totals use `.toDecimalPlaces(2)` where 2-decimal currency precision is expected.
- Comparison tolerance: exact Decimal equality for Decimal(19,2) fields.

### Missing/ambiguous data handling
- Missing records (`null`) are explicitly distinguished from zero values.
- Missing `FundFlow` or `WIP` records set calculation indicators and emit `MISSING_FUND_FLOW` / `MISSING_WIP`.
- Missing or contradictory fields emit `MISSING_AMBIGUOUS_SOURCE_DATA` or `UNSUPPORTED_CALCULATION` rather than being coerced to zero.

## D. Discrepancy catalog

| Code | Meaning | Trigger condition | Severity |
|------|---------|-------------------|----------|
| `COMPLETED_WORK_EXCEEDS_TOTAL` | Completed work exceeds project value | `completedWorkAmt > totalProjectCost` | CRITICAL |
| `PROJECT_FUND_FLOW_MISMATCH` | Project and FundFlow values disagree | `estimatedCost != totalProjectCost` | WARNING |
| `LEGACY_FEE_RECEIVED_MISMATCH` | Legacy feeReceived differs from DueBill settlements | `feeReceived != sum(receivedAmount)` | WARNING |
| `SETTLEMENT_COMPONENTS_MISMATCH` | Stored receivedAmount != component sum | `receivedAmount != cheque + sd + tds` | CRITICAL |
| `SETTLEMENT_EXCEEDS_INVOICE` | Settlement exceeds invoice total | `receivedAmount > billAmount` | CRITICAL |
| `FEE_STAGES_MISMATCH` | Fee stages sum != contract fee | `sum(feeStage.amount) != totalFee` | WARNING |
| `WIP_FUND_FLOW_DISAGREEMENT` | WIP and FundFlow work values differ | `amountOfWorkDone != completedWorkAmt` | WARNING |
| `RECEIPT_WITHOUT_DATE` | Payment recorded without receive date | `chequeAmount/receivedAmount > 0` and `receiveDate == null` | WARNING |
| `MISSING_FUND_FLOW` | No FundFlow record for project | `fundFlow == null` | WARNING |
| `MISSING_WIP` | No WIP record for project | `wip == null` | WARNING |
| `CANCELLED_BILL_WITH_PAYMENT` | Cancelled bill has payment data | `status == CANCELLED` and payment fields > 0 | WARNING |
| `CONTRADICTORY_PAYMENT_DETAILS` | Stored amounts differ from computed amounts | `billAmount != gross + sgst + cgst` or `receivedAmount != cheque + sd + tds` | CRITICAL |
| `MISSING_AMBIGUOUS_SOURCE_DATA` | Required data missing or ambiguous | Missing GST on positive gross, no DueBills, etc. | INFO |
| `UNSUPPORTED_CALCULATION` | Indeterminate accounting | Requested comparison impossible given schema | INFO |

## E. Verification evidence

| Gate | Command | Result | Notes |
|------|---------|--------|-------|
| Targeted reconciliation tests | `npx vitest run src/lib/fund-flow/reconciliation.test.ts src/lib/actions/reconciliation.test.ts` | **PASS** | 19/19 tests passed |
| Full test suite | `npx vitest run` | **PASS** | 155/155 tests passed across 14 test files |
| TypeScript typecheck | `npx tsc --noEmit` | **PASS** | Zero errors |
| ESLint | `npm run lint` | **PASS** | 0 errors; 14 warnings (all pre-existing in unrelated files) |
| Production build | `npm run build` | **PASS** | Compiled and generated static pages successfully |

## F. Safety confirmation

- **Schema changes:** None. No Prisma schema or migration files modified.
- **Database writes:** None. No INSERT, UPDATE, DELETE, UPSERT, or TRUNCATE operations in any new code.
- **Seed scripts / data resets:** None.
- **UI changes:** None. No new screens, components, or pages.
- **Deployment changes:** None. No CI/CD, infrastructure, or environment modifications.
- **Production database access:** None. Tests use synthetic fixtures and mocked Prisma.
- **Existing project records:** Untouched.

## G. Remaining issues

1. **Receipt confirmation ambiguity:** The schema does not include a field confirming whether `chequeAmount` has been cleared/received. The reconciliation engine reports this limitation explicitly.
2. **Cancelled bill legacy aggregation:** Existing `due-bill.ts` server action (`syncFundFlowFeeReceived`) aggregates `receivedAmount` across all DueBills for a project, including cancelled bills. The reconciliation engine excludes cancelled bills from its own settlement totals, which can contribute to `LEGACY_FEE_RECEIVED_MISMATCH`.
3. **Legacy FundFlow total fee missing:** The `FundFlow` model does not have a `totalFee` field. A requested comparison against "Legacy FundFlow total fee" is unsupported by the schema and is handled by omission with documentation.
4. **WIP semantic ambiguity:** `amountOfWorkDone`, `finalProgressAmount`, and RA bill fields represent different accounting concepts. The engine reports them side-by-side rather than treating them as equivalent.

## H. Final stage decision

All mandatory acceptance criteria are met:
- Pure read-only reconciliation module implemented.
- Server-side RBAC-protected read function implemented.
- 15 test scenarios (T01–T15) covered and passing.
- Decimal-safe arithmetic enforced.
- 14 stable discrepancy codes implemented with severity and explanations.
- All quality gates pass (tests, typecheck, lint, build).
- No schema changes, database writes, UI changes, or deployment actions.

`FF-01A: PASS`
