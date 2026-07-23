# SAEC ERP — Credentials & Access Guide

## Live System

| Environment | URL |
|-------------|-----|
| **Live Server** | http://43.242.227.51:8080 |
| **Login Page** | http://43.242.227.51:8080/login |
| **Dashboard** | http://43.242.227.51:8080/dashboard |

---

## User Accounts

| Role | Email | Password | Access Level |
|------|-------|----------|--------------|
| **Admin** | admin@saec.com | ChangeMe123! | Full access — all modules, settings, user management, audit logs |
| **Manager** | manager@saec.com | TestPass123! | Most modules, export/import, notifications, user rights |
| **Staff** | staff@saec.com | TestPass123! | Operational modules, notifications, user rights (no export/import, no audit log) |
| **Auditor** | auditor@saec.com | TestPass123! | Read-only access, export/import, audit logs, notifications |

---

## Role Permissions Matrix

| Feature | Admin | Manager | Staff | Auditor |
|---------|-------|---------|-------|---------|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Fund Flow | ✅ | ✅ | ✅ | ✅ |
| Due Bills | ✅ | ✅ | ✅ | ✅ |
| Work in Progress | ✅ | ✅ | ✅ | ✅ |
| Contractors | ✅ | ✅ | ✅ | ✅ |
| Tenders | ✅ | ✅ | ✅ | ✅ |
| Payment Schedules | ✅ | ✅ | ✅ | ✅ |
| Vehicle Log Book | ✅ | ✅ | ✅ | ✅ |
| Assets | ✅ | ✅ | ✅ | ✅ |
| In-Out Register | ✅ | ✅ | ✅ | ✅ |
| TADA Bills | ✅ | ✅ | ✅ | ✅ |
| Tasks | ✅ | ✅ | ✅ | ✅ |
| Reports | ✅ | ✅ | ✅ | ✅ |
| Settings — Export/Import | ✅ | ✅ | ❌ | ✅ |
| Settings — Notifications | ✅ | ✅ | ✅ | ✅ |
| Settings — Audit Log | ✅ | ❌ | ❌ | ✅ |
| Settings — User Management | ✅ | ❌ | ❌ | ❌ |
| Settings — User Rights | ✅ | ✅ | ✅ | ✅ |
| Bulk Import | ✅ | ✅ | ✅ | ✅ |
| AI Assistant | ✅ | ✅ | ✅ | ✅ |
| AI Executive Summary | ✅ | ✅ | ✅ | ✅ |

---

## Module Quick Links

| Module | URL |
|--------|-----|
| Dashboard | http://43.242.227.51:8080/dashboard |
| Fund Flow | http://43.242.227.51:8080/dashboard/fund-flow |
| Due Bills | http://43.242.227.51:8080/dashboard/due-bills |
| Work in Progress | http://43.242.227.51:8080/dashboard/wip |
| Contractors | http://43.242.227.51:8080/dashboard/contractors |
| Tenders | http://43.242.227.51:8080/dashboard/tenders |
| Payment Schedules | http://43.242.227.51:8080/dashboard/payment-schedules |
| Vehicle Log Book | http://43.242.227.51:8080/dashboard/vehicle-log-book |
| Assets | http://43.242.227.51:8080/dashboard/assets |
| In-Out Register | http://43.242.227.51:8080/dashboard/in-out-register |
| TADA Bills | http://43.242.227.51:8080/dashboard/tada-bills |
| Tasks | http://43.242.227.51:8080/dashboard/tasks |
| Reports | http://43.242.227.51:8080/dashboard/reports |
| Settings | http://43.242.227.51:8080/dashboard/settings |

---

## Notes

- All test users (Manager, Staff, Auditor) were created for testing purposes.
- Admin account was pre-existing.
- Passwords should be changed after initial login in production.
- The AI Assistant (bottom-right floating button) is available to all roles.
- Bulk Import is available on all module pages — download the CSV/Excel template first.
