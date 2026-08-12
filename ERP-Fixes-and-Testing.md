# ERP System — Fixes & Testing Guide

**Live Server:** http://43.242.227.51:8080  
**Updated:** July 29, 2026

---

## 1. WIP → Task Auto-Linking

**What it does:** When a WIP (Work in Progress) record is created or updated with dates for LOI Receipt, Agreement, Work Order, or Security Deposit Return, the system automatically creates linked tasks in the Tasks module.

- Tasks are assigned to the HO/RO coordinator if specified
- Each task has a due date matching the relevant WIP date
- Duplicate tasks are not created for the same WIP + date type
- Deleting a WIP record also deletes its linked tasks

### How to test:
1. Log in as Admin or Manager
2. Go to **WIP** module → Create a new WIP entry (or edit existing)
3. Fill in **LOI Receipt Date**, **Agreement Date**, **Work Order Date**, and/or **Security Deposit Return Date**
4. Save the record
5. Go to **Tasks** module — you should see new tasks with titles like:
   - "LOI received — [Project Name]"
   - "Agreement — [Project Name]"
   - "Work order received — [Project Name]"
   - "Security deposit return — [Project Name]"
6. Each task should show a **WIP** badge in the Source column
7. Delete the WIP record → verify linked tasks are also removed

---

## 2. Tender → Task Auto-Linking

**What it does:** When a Tender is created or updated with dates for Tender Fee, EMD Deposit, EMD Return, Bidding Last Date, Tender Opening, or Pre-Bid Meeting, the system automatically creates linked tasks.

- Tender Fee and EMD tasks are marked HIGH priority
- EMD Return and Pre-Bid Meeting tasks are MEDIUM priority
- Duplicate prevention — same task won't be created twice
- Deleting a Tender also deletes its linked tasks

### How to test:
1. Go to **Tenders** module → Create a new tender (or edit existing)
2. Fill in **Tender Fee Date**, **EMD Date**, **Bidding Last Date**, **Date of Opening**, and/or **Pre-Bid Meeting Date**
3. Save the record
4. Go to **Tasks** module — you should see new tasks with titles like:
   - "Tender fee payment — [Tender Name]"
   - "EMD deposit — [Tender Name]"
   - "Bidding last date — [Tender Name]"
   - "Tender opening date — [Tender Name]"
   - "Pre-bid meeting — [Tender Name]"
5. Each task should show a **TENDER** badge in the Source column
6. Delete the Tender → verify linked tasks are also removed

---

## 3. Task Enhancements

**What it does:** The Tasks module now supports additional fields for better tracking and workflow management.

### New fields added:
- **Department** — text field (e.g., Civil, Electrical, Accounts)
- **Reviewer** — staff dropdown to assign a reviewer separate from the assignee
- **Percentage Completion** — slider (0-100%) shown in both edit form and table
- **Source Module** — badge showing where the task originated (WIP, TENDER, or Manual)
- **Activity Log** — field available in schema for future logging

### How to test:
1. Go to **Tasks** module → Click **New Task**
2. Verify the form now has **Department** (text input) and **Reviewer** (staff dropdown) fields
3. Create a task with department and reviewer filled in
4. In the task table, verify:
   - **Progress** column shows a progress bar with percentage
   - **Source** column shows "Manual" for manually created tasks
   - "WIP" or "TENDER" badge for auto-linked tasks
5. Click the edit (pencil) icon on any task
6. Verify the edit form has:
   - Department field
   - Reviewer dropdown
   - Percentage Completion slider with live % display
7. Set percentage to 50% → save → verify progress bar updates in table

---

## 4. Bill Summary View (Consul Bill)

**What it does:** The Due Bills module now has a Summary view that groups bills by client with subtotals, matching the "Consul Bill" workflow format from the Excel document.

### Features:
- Toggle between **List** view (individual bills) and **Summary** view (grouped by client)
- Each client row is expandable to show individual bills underneath
- Subtotals per client for: Gross Amount, Bill Amount, Received, Cheque Amount, SD, IT/TDS
- Grand total row at the bottom
- All existing filters (region, client, project, status, scheme) work in both views

### How to test:
1. Go to **Due Bills** module
2. Verify a **List / Summary** toggle button appears in the top right
3. Click **Summary** — the view should switch to a grouped table
4. Each row shows a client name with aggregate totals
5. Click a client row to expand — individual bills appear underneath
6. Verify subtotals row appears at the bottom of each expanded group
7. Verify grand total row at the very bottom
8. Apply a filter (e.g., select a specific client) — verify both views respect the filter
9. Click **List** to switch back to the normal view

---

## 5. TADA Approval Workflow — Verified

**What it does:** The TADA (Travel/DA) Bills module already has the full multi-level approval chain as specified in the workflow document.

### Existing approval fields:
- **Manager Remarks** + Manager Approved At/By
- **Accounts Remarks** + Accounts Verified At/By
- **Finance Approved At/By**
- **Paid At**
- Status flow: DRAFT → PENDING_MANAGER → MANAGER_APPROVED → PENDING_ACCOUNTS → ACCOUNTS_VERIFIED → PENDING_FINANCE → FINANCE_APPROVED → PAID

### How to test:
1. Go to **TADA Bills** module
2. Create a new TADA claim with tour details and expenses
3. Submit for approval — status should change to PENDING_MANAGER
4. Log in as Manager → approve with remarks
5. Verify status advances through the approval chain
6. Check that remarks and timestamps are recorded at each stage

---

## Summary of All Changes

| # | Feature | Module | Status |
|---|---------|--------|--------|
| 1 | WIP → Task auto-linking | WIP + Tasks | ✅ Live |
| 2 | Tender → Task auto-linking | Tenders + Tasks | ✅ Live |
| 3 | Task enhancements (department, reviewer, % completion, source badge) | Tasks | ✅ Live |
| 4 | Bill Summary view (client-wise grouped totals) | Due Bills | ✅ Live |
| 5 | TADA approval workflow verification | TADA Bills | ✅ Verified |

---

## Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@saec.com | ChangeMe123! |
| Manager | manager@saec.com | TestPass123! |
| Staff | staff@saec.com | TestPass123! |
| Auditor | auditor@saec.com | TestPass123! |
