# SAEC ERP — Older-User UI/UX Audit

**HEAD audited:** `70fe6a6` · **Perspective:** office employee 55–60, limited software experience
**Reference:** `ERP - Work Flow Formats.xlsx` · **Scope:** 11 non-HR modules + shell · HR excluded
**Method:** real browser at 1366×768 (all modules + dialogs) and 390×844 mobile sweep, computed-style metrics on every module page. Read-only — no changes made.

## A. Executive assessment

The ERP is **generally clean and consistent**: labelled nav, labelled filters, labelled dialogs that always show "Cancel" + a create/save button, no mobile horizontal overflow on any module, filename-first documents, readable tables. The barriers cluster into five themes: **icon-only row actions**, **sub-12px badge text**, **below-target controls (28–32 px)**, **low-contrast helper text**, and **placeholder-only field labels**. None requires business-rule or schema changes — all are presentation-level fixes.

## B. What was actually browser-tested

| Tested | Evidence |
|---|---|
| All 12 screens loaded @1366 + @390 (0 overflow, 0 app errors) | `qa-shots/ux-*.png` |
| 7 form dialogs (WIP edit, Task create, Due Bill, Contractor, TADA, Vehicle, Asset) — all fit 768px, Save+Cancel visible | `qa-shots/ux-form-*.png` |
| Computed metrics per screen: tiny text, icon-only buttons, <30px targets, unlabeled inputs, raw IDs/paths | this report |
| Earlier fixes re-verified live: filename chips, direction-aware in-out CTAs, project-wise report | prior sessions |

**Not tested:** Bulk Import flows, Reports screens, Ask AI, mobile sub-390 widths, screen-reader pass (NVDA/VoiceOver), print styles.

## C. Module-by-module matrix

| Module | Key issues | Severity |
|---|---|---|
| **Tasks** | 96 sub-12px texts (statuses, "MEDIUM/HIGH", "+1", overdue); Source column shows technical ids `wip`/`tender`/`in out registe`(truncated); icon-only edit; row-click affordance weak | **P1** |
| **Fund Flow** | `₹49.9994` vs `₹8.58` inconsistent decimals in Total Fee col; 4 unlabeled filter inputs; otherwise exemplary (View/Edit text button, clear report) | P2 |
| **Due Bills** | icon-only Pencil + invoice/reminder icon buttons; 2 unlabeled dialog inputs; tiny stage badges | P1 |
| **WIP** | icon-only Pencil edit; 4 unlabeled filter inputs; otherwise clear | P2 |
| **Contractors** | icon-only Pencil; doc card names already basenames | P2 |
| **Tenders** | 8 unlabeled inputs (filter texts + dates rely on placeholders); icon-only Pencil | **P1** |
| **Payment Schedules** | 6 unlabeled inputs; icon-only Pencil | P2 |
| **TADA Bills** | tiny "Manager Approved"/"Draft" stage badges; 3 unlabeled inputs | P2 |
| **Vehicle Log Book** | icon-only Pencil ×4 places; otherwise clear | P2 |
| **Property** | tiny "person"/"office" holder chips; 3 unlabeled inputs; icon-only Pencil | P2 |
| **In-Out Register** | 6 unlabeled inputs; 17 small targets; direction fix verified working | P2 |
| **Shell/nav** | clear module names, correct terminology; only `manager@saec.com` is sub-12px | OK |

## D. Top confirmed improvements (priority order)

### Must fix before customer use
| # | Problem | Smallest fix | Effort | Risk |
|---|---|---|---|---|
| 1 | **Icon-only ✏️ edit on every table** except Fund Flow — discoverability requires hover tooltip; a 55–60 user may not know the row is editable | Replace/reinforce with a labelled `View / Edit` outline button (Fund Flow pattern) in: wip, tenders, due-bills, property, in-out, vehicle, payment-schedules, tasks | ½d | low |
| 2 | **Sub-12px badge text** — task statuses, priorities, stage labels, counters render ~10–11px | Raise badge/chip font to `text-xs` (12px) minimum on task-table, tada stages, property holder chips, in-out tab counters | ¼d | low |
| 3 | **Placeholder-only fields lose context** — 8 (tenders), 6 (payment-schedules), 6 (in-out), 5 (task dialog), 5 (asset) inputs rely on placeholders that vanish when typing | Add visible `<label>` above or left of each unlabeled filter/dialog input | ½d | low |

### Strongly recommended
| # | Problem | Fix | Effort | Risk |
|---|---|---|---|---|
| 4 | **Technical Source badges** on Tasks — `wip`, `tender`, `in out registe` (truncated mid-word) | Map to `WIP` / `Tender` / `In-Out` / `Manual`; widen or remove truncate | ¼d | low |
| 5 | **Low-contrast helper text** — `text-zinc-400` (~3:1 on white) used for "Not entered", hints, empty-state copy — fails WCAG AA | Switch helper/hint text to `text-zinc-500` (≈4.6:1) or darker | ¼d | low |
| 6 | **Inconsistent decimals** — Total Fee shows `₹49.9994` next to `₹8.58` in the same column | Standardize Fund Flow table money columns to 2dp display (6dp internals unchanged) | ¼d | low |
| 7 | **Inconsistent Save/Create labels** — "Create bill" / "Create Claim" / "Create asset" / "Create Task" / "Create contractor" / "Create vehicle" vs "Save changes" | One rule: `Create <Thing>` sentence-case, `Save changes` on edit | ¼d | low |
| 8 | **Sub-target controls** — every filter button, tab pill and row action is 28–32px (44px is the guidance) | Bump shared Button `size="sm"` to h-9 (36px) min; keep `sm` semantic everywhere — one component change propagates | ¼d | med (visual shift across all pages — needs visual QA) |
| 9 | **Row-click discoverability** — task/wip rows open editor on click with no visible cue | Keep text `View / Edit` button (issue #1 covers); add `cursor-pointer` + row hover tint already present | – | – |

### Optional
| # | Problem | Fix | Effort |
|---|---|---|---|
| 10 | "Bulk Import" terminology may confuse non-technical staff | Rename button to "Import list (Excel/CSV)" or keep + add tooltip | trivial |
| 11 | `manager@saec.com` raw email in sidebar footer | Show display name ("QA Manager" already shown above it) | trivial |
| 12 | Tenders "New tender" vs "New claim" vs "New asset" capitalization varies | same fix as #7 | – |
| 13 | Overdue tasks show date in red + "Overdue" — good; consider a filter chip for "Overdue only" | optional | ¼d |
| 14 | Long module tables have no row numbering — hard to reference a row over the phone | Add # column optional | ¼d |
| 15 | Tab counts (In-Out `5`, `0`) are sub-12px in pills | covered by #2 | – |

## E. Recommended common UI standards

- **Minimum font:** 12px (`text-xs`) for any information-bearing element; 11px only for decorative counters.
- **Row edit:** always a labelled `View / Edit` button (Fund Flow pattern); pencil icons allowed as *secondary* affordance, never sole.
- **Every input needs a visible label** — placeholders are hints, not labels.
- **Money display:** 2 decimals everywhere user-facing; 6-decimal internals preserved.
- **Buttons:** `Create <Thing>` on new-record dialogs, `Save changes` on edit, `Cancel` always present, destructive actions red + confirm.
- **Badges:** title-case text (wip→WIP is fine as an acronym), minimum `text-xs`.
- **Helper text:** `text-zinc-500` minimum on white.

## F. Implementation plan (independent, reorderable)

1. **P1 batch A** — labelled View/Edit buttons on 7 tables (mirror fund-flow pattern)
2. **P1 batch B** — font-size floor: sweep `text-[10px]`/`text-[11px]` → `text-xs` on badges/chips/status
3. **P1 batch C** — visible labels on ~30 unlabeled inputs (tenders, payment-schedules, in-out, task/asset dialogs)
4. **P2 batch** — contrast bump zinc-400→zinc-500 on hint text; Task source-badge labels; 2dp Total Fee display; Save/Create label normalization
5. **Optional batch** — #10–#14

## G. Effort & regression risk

~1.5–2 days total. All changes are presentation-only — no schema, no calculations, no actions. Regression risk is low except item #8 (control-height bump shifts every page's density — validate 1366×768 after). 431-test suite + build must stay green; browser re-verify the 11 modules after each batch.

## H. Excel constraints — do NOT change

- Row 12/14/16/18 formula boundaries (Apr 2026–Jun 2027 company / Mar 2028 projects)
- Official terminology: RA Bill, TADA, EMD, LOI, SD, Schedule B, 3A annexure, Inward/Outward, CC
- DECIMAL(23,6) internal precision; blank ≠ explicit-zero distinction
- Provenance/exclusion semantics for Row 12 contributors

## Verdict

**Ready for customer use after the 3 P1 batches** (~1 day of work) — the app is structurally sound; the barriers are small, consistent and cheap to fix.
