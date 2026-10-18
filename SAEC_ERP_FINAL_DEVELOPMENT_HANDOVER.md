# SAEC ERP — Final Development Handover

**Branch:** `feat/fund-flow-ff01a` · **Local HEAD:** `6bc01e5` (local only — not pushed, not deployed)
**Authoritative source:** `docs/ERP - Work Flow Formats.xlsx`
**Status:** CODE-COMPLETE for all implementable requirements. NOT customer-accepted, NOT production-deployed.

---

## 1. Scope

11 non-HR worksheets, in scope only:

In-Out Register · Vehicle Log Book · Property List · Consultant Bills · Fund Flow · Tender · TADA Bills · Payment Schedules · Contractors · WIP · To-Do Tasks

**HR worksheet excluded entirely** — no inspection, design, or modification.

## 2. Completed features by worksheet

| Worksheet | Status | What exists |
|---|---|---|
| Fund Flow | ✅ COMPLETE | Project tracking, allocations, expenses, monthly planned/actual nets and running balances (FF-01A–O, Decimal precision) |
| Consultant Bills | ✅ COMPLETE | GST split (CGST/SGST), billing lifecycle, recorded receipts (4A) |
| Payment Schedules | ✅ COMPLETE | Due dates, linked `follow_up` tasks, sync, delete protection (2A/2B, 5A) |
| To-Do Tasks | ✅ COMPLETE | Lifecycle OPEN→IN_PROGRESS→PENDING_REVIEW→COMPLETED, rework, attachments, multi-assignee (co-assignees), due-date reminders (2C/2D, P4, 5A) |
| Tender | ✅ COMPLETE | 7 deadline events as stable keyed tasks, concern-authority assignment (3A, 5A) |
| Contractor | ✅ COMPLETE | Master records, Tender ID suggestions, linked-project RA Bill read-only panel with cert/test-copy/bill-copy separation (3B/3C, P1) |
| WIP | ✅ COMPLETE | 4 RA Bill slots with amount/date/fee/expense/WO No./details/bill copy/certificate/test copy; LOI/agreement/WO/SD/3A keyed tasks; no wrong-assignee fallback (P1, 5A/5B) |
| In-Out Register | ✅ COMPLETE | Correspondence, client master, per-staff CC and action tasks (`cc:<staff>`/`action:<staff>` keys), reply tracking (4B, 5A) |
| Vehicle Log Book | ✅ COMPLETE | KM validation, server-computed distance, stable staff travellers (join table), doc-expiry engine check, approvals (4C, P2) |
| Property List | ✅ COMPLETE | Quantity integrity, generated IDs, movement history, stable `responsiblePersonId` FK (4D, P3) |
| TADA Bills | ⚠️ PARTIAL | Staged claim workflow (DRAFT→…→PAID), manager routing, docs (4E). Attendance linkage **pending customer rule** |

## 3. Test results (automated, final run)

- **426/426 tests pass** across 45 files
- **TypeScript:** 0 errors
- **Lint:** 0 errors, 14 pre-existing warnings (React hook deps + unused eslint-disable directives)
- **Production build:** ✓ (`Compiled successfully`, 28 static pages)

Browser-verified during development: RA Bill save/persist, traveller join, responsible-person FK, task co-assignee +N badge, keyed tender-task idempotency, unauth upload-file 307 vs authed 200.

## 4. Outstanding customer decisions (recorded, not implemented)

| # | Decision needed | Current safe default |
|---|---|---|
| 1 | TADA attendance: which status + which tour dates get marked | Nothing written — `Attendance` model exists but no module/rule governs it |
| 2 | Co-assignee rights: view-only, or may they progress/submit/review? | View-only; primary `assignedToId` stays the sole accountable actor |
| 3 | RA Bills beyond 4 per project | Not supported — workbook defines 4 slots |
| 4 | Reminder windows/recipients | Current behavior: Task 7d, Vehicle 30d, PS 7d, In-Out 15d, Due Bill 7d — **not approved customer policy** |

## 5. Known defects and release blockers

- **Document authorization limitation (recorded, partially mitigated):** `/uploads/**` files required a session only after `6bc01e5`; they are **not record-level authorized** — any logged-in user can fetch any module file by URL. Task attachments (`/api/task-files/[id]`) DO enforce record-level access. Do NOT treat `/uploads` as safe for unrestricted production use without a follow-up storage redesign.
- **No in-app scheduler:** reminder checks need external cron → `POST /api/notifications/check` with `CRON_SECRET`, or manual admin trigger.
- **8 legacy unkeyed linked tasks** (incl. renamed `Bidding deadline — RENAMED BY STAFF`) preserved unkeyed — flagged for manual review; no auto-deletion.
- Lint warnings listed in §3 are pre-existing and non-blocking.

## 6. Database migrations

**Applied to isolated test DB `saec_erp_manual_test` (all additive):**

| Migration | Change |
|---|---|
| `20261018203000_phase5a_source_event_key` | `Task.sourceEventKey` + unique `(sourceModule, sourceEntityId, sourceEventKey)` |
| `20261018210000_final_ra_bill_fields` | 16 nullable `raBillN*` columns on `WorkInProgress` |
| `20261018212000_journey_travellers` | `JourneyLogTraveller` join (RESTRICT on Staff delete) |
| `20261018214000_asset_responsible_staff` | `Asset.responsiblePersonId` FK (SET NULL) |
| `20261018215500_task_co_assignees` | `TaskCoAssignee` join |

**Production:** all 5 above are pending production — none have been applied there. Apply after verified backup; see §8.

## 7. Backups

- `/tmp/saec_backup_phase5a.sql` — 3,917 lines (pre-5A)
- `/tmp/saec_backup_final.sql` — 3,930 lines (pre-P1)

## 8. Production migration checklist (for later)

1. Verify prod DB identity — NOT `saec_erp_manual_test`
2. `pg_dump` backup + spot-restore validation; snapshot `public/uploads/` + `private_uploads/`
3. Apply the 5 migrations above in listed order (`prisma migrate deploy`), then `prisma generate` + app restart
4. Verify columns/joins present; confirm no existing rows were modified
5. Smoke: WIP RA fields, journey travellers, asset responsible person, task co-assignees
6. Rollback: all additive — drop new columns/tables without touching legacy data
7. Configure external cron for notification checks

## 9. Manual UAT checklist (for customer later)

- [ ] Fund Flow: create project → allocation → monthly expense → verify net/balance
- [ ] Consultant Bill: GST split, record receipt
- [ ] Payment Schedule: due date → linked `follow_up` task appears
- [ ] Task: assign → accept → progress → submit → review/rework; co-assignee visible (+N); due-date reminder after cron
- [ ] Tender: save deadline → keyed task; rename → no duplicate on re-save
- [ ] Contractor: open linked project → RA cert/test copy/bill copy distinct
- [ ] WIP: RA Bill 1–4 WO No./details persist on save/reload
- [ ] In-Out: inward + CC staff → separate `cc:`/`action:` tasks
- [ ] Vehicle: log journey with travellers → distance computed, approval flow
- [ ] Property: register asset → responsible person stores staff id
- [ ] TADA: claim → manager → accounts → finance → paid
- [ ] Documents: unauth URL access to any `/uploads/**` file → redirected to login

## 10. Completion statement

- **Code-complete:** YES — every Excel-defined, rule-sufficient requirement across the 11 worksheets is implemented and verified.
- **Customer-accepted:** NO — manual UAT and the 4 decisions in §4 are outstanding.
- **Production-ready:** NO — pending prod migration, cron setup, and the record-level document-authorization limitation in §5.
