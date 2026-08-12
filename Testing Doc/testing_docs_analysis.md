# 📋 Analysis of the 3 Testing Documents

These 3 documents are all related to the **SAEC ERP** application — the same project you just set up locally. They were created by the **company (SAEC)** that hired the developer to build this ERP system. Together, they represent **the complete requirements, detailed specifications, and a bug/issue report** for the ERP software.

---

## Document 1: `erp detail 13 5 26 (1).pdf`
### 📄 What it is: **Requirements & Reports Specification**

This is the **original requirements document** that defines what reports and data views the ERP system should provide. It's essentially a wish-list of features organized by module:

| Module | What Reports Are Needed |
|---|---|
| **Property List** | Category-wise, age-wise, office-wise, warranty-wise, and person-assigned reports for assets like furniture, electronics, computers |
| **HR Reports** | Staff detail reports filterable by date, month, location, project, post, qualification, experience |
| **Inward–Outward Register** | Client-wise, date-wise, age-wise (15/20/25 days overdue), staff-wise, department-wise pending replies |
| **Vehicle Log Book** | KM reports (date/month/purpose-wise), person-wise travel, expense reports (fuel, maintenance, tax, insurance, PUC, service), renewal reminders |
| **Tender Management** | Tender applied reports (date/month/city/state/platform/service-wise), tender fee & EMD reports, tender status (open/close/assigned) |
| **Work In Progress (WIP)** | Work order reports, staff allocation, RA Bill reports, final progress reports |
| **Contractor Management** | Billing status, project progress |
| **Payment Schedules** | Reports by payment type, category (GST/TDS/Vehicle Loan), and amount |

> **In simple terms:** This PDF says *"Here are all the reports and views we need in the ERP software."*

---

## Document 2: `c - project mgnt - 13 10 (4).xlsx`
### 📊 What it is: **Detailed Module Design & Data Field Specifications**

This Excel file has **11 sheets**, each defining the exact data fields, input rules, and master-list relationships for every module. It's the **blueprint** the developer was supposed to follow when building each module.

| Sheet Name | Module | What It Defines |
|---|---|---|
| **Tender / Tender gr** | Tender Management | Fields like date, tender name, department, state, city, platform, work type, service type, pre-bid meeting, bidding last date, tender fee, EMD, price comparison (L1/L2/L3 dealers), negotiation meeting |
| **wip / wip gr** | Work In Progress | Project name, LOI, agreement, work order, amount, security deposit, HO/RO coordinators, staff levels (L1–L4), RA Bills (1–4), final progress, 3A certificate, completion certificate |
| **contractor / contractor gr** | Contractor Detail | Detailed order, name/type of work, DPR, tender ID, contractor name/amount, work order, drawings, contact details, Schedule B, RA bills, final progress, completion certificate |
| **veh log bk gr** | Vehicle Log Book | Vehicle details, date, tour from–to, start/end KM, total KM, persons travelling, purpose, fuel/service/maintenance amounts, tax, approval by authority. Also tracks RC Book, Insurance, PUC, Tyre & Battery warranty |
| **H R gr** | Human Resources | Employee ID, name, department, phone, interview form, resume, ID proof, address proof, degree, designation, joining date, parents' names, addresses, email, DOB, nationality, religion, marital status, exit date |
| **pmt sch gr** | Payment Schedules | Payment type, date, due date, category (Excise/GST/TDS/Vehicle Loan), detail, amount |
| **property list gr** | Property & Asset List | Item code (auto-generated), category, make, model, year of purchase, quantity, security code, bills & warranty, assign to person/office, responsible person |
| **in out reg gr** | In-Out Register | Document date, received date, document reference number, from (client), detail, CC marking, action suggested, reply date, reply reference number |

> **In simple terms:** This Excel says *"For each module, here are the exact fields, dropdown options, master lists, and rules the developer must implement."*

---

## Document 3: `erp 2 0 update.docx`
### 🐛 What it is: **Bug Report & Testing Feedback (with 37 screenshots)**

This is the most critical document. It's a **bug/issue report** written in **Gujarati and English**, dated **7-Aug-2026 and 11-Aug-2026**. It documents problems found during testing of the ERP 2.0 application.

### The Gujarati text summary (translated):
> *In the initial meeting, modules were discussed as per requirements. Modules were prioritized, and flows/reports were discussed in detail, and an MOU was signed. During the first trial, module and report deficiencies were discussed in detail. After updates, during re-testing, deficiencies were found again, and a detailed conference was held. Despite repeated notifications via WhatsApp, phone calls, and email to the ERP developer, the defects have NOT been resolved. Every time during checking and trial, new defects appear and previously reported defects keep repeating. It has been observed that proper work is NOT being done on the flows and reports given to the ERP developer.*

### Specific Bugs Found (with screenshots):

| # | Bug Description | Severity |
|---|---|---|
| 1 | Error while uploading Clients in bulk | 🔴 High |
| 2 | Adding manual client also shows unclear error | 🔴 High |
| 3 | Bulk staff upload: Reporting manager not mentioned, status shows True/False instead of Active/Inactive, employee code not auto-generated, manual entry creates duplicates | 🔴 High |
| 4 | TADA allows backdated entries (1-1-2024), can select any region for anyone | 🟡 Medium |
| 5 | Location field allows anything (no specific city names from master list) | 🟡 Medium |
| 6 | Inactive staff can submit Claims/TADA | 🔴 High |
| 7 | New city name not allowed to add for journey | 🟡 Medium |
| 8 | Same asset can be assigned to multiple employees simultaneously | 🔴 High |
| 9 | No bulk import option in master data | 🟡 Medium |
| 10 | Display errors continue throughout | 🟡 Medium |
| 11 | Employee master not found | 🔴 High |
| 12 | Error during bulk import of staff | 🔴 High |
| 13 | No project update for contractor | 🟡 Medium |
| 14 | Department shows 2 items instead of correct list | 🟡 Medium |
| 15 | Tender shows only 1 item | 🟡 Medium |
| 16 | State & city mismatch | 🟡 Medium |
| 17 | Backdate selection in payment schedule, paid status can be created manually | 🟡 Medium |
| 18 | Negative amounts can be created | 🔴 High |
| 19 | Negative TADA values allowed | 🔴 High |
| 20 | From/To city not populated from city master | 🟡 Medium |
| 21 | Rejected status can be created (shouldn't be manually settable) | 🟡 Medium |
| 22 | Vehicle with "Sold" status can still create entries (vehicle 7410) | 🔴 High |
| 23 | Manufacturing year 2040 allowed (future year) | 🟡 Medium |
| 24 | Property assign movement not displayed | 🟡 Medium |
| 25 | Staff name not available / responsible person field issues | 🟡 Medium |
| 26 | Backdate reply allowed in In-Out Register | 🟡 Medium |
| 27 | Future date allowed in In-Out, negative days in status | 🔴 High |
| 28 | No "informative" or "action oriented" type in inward entries | 🟡 Medium |
| 29 | Task assign-to-wise report not found | 🟡 Medium |
| 30 | Person name showing in office field | 🟡 Medium |
| 31 | Negative value allowed in age field | 🔴 High |

> **In simple terms:** This document says *"We tested the ERP your developer built, and here are 31+ bugs we found — many of them were reported before and still haven't been fixed. The developer is not doing proper work."*

---

## 🎯 Overall Summary

| Document | Purpose |
|---|---|
| **PDF** | "Here's WHAT we need" (Requirements) |
| **Excel** | "Here's HOW each module should work" (Detailed Design) |
| **DOCX** | "Here's WHAT'S BROKEN" (Bug Report with 37 screenshot proofs) |

These documents paint a clear picture: your friend's company (SAEC) hired a developer to build an ERP system. They provided detailed requirements (PDF + Excel), but after multiple rounds of testing, they found **31+ bugs** that keep recurring. The DOCX is essentially a **formal complaint/escalation document** showing that the developer has not been fixing the reported issues properly.
