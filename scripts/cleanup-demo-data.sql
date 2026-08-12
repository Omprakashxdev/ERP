-- ERP Database Cleanup Script
-- Wipes all demo business data while keeping:
--   - User accounts (auth)
--   - RegistrationRequest
--   - RolePermission
--   - NotificationRule
--   - Lookup masters: State, City, Department, Designation, Platform,
--     PaymentType, AssetCategory, AssetMake, AssetModel, OrderMaster,
--     WorkMaster, DprMaster, TsAaMaster

BEGIN;

TRUNCATE TABLE
  "AuditLog",
  "Notification",
  "Attendance",
  "EmployeeDetail",
  "TadaClaim",
  "Task",
  "WipAssignment",
  "WorkInProgress",
  "DueBill",
  "FundFlowMonthly",
  "FundFlow",
  "ProjectFeeStage",
  "ProjectAssignment",
  "Project",
  "InOutRegisterCcStaff",
  "InOutRegisterDocument",
  "InOutRegister",
  "AssetMovement",
  "Asset",
  "JourneyLogPhoto",
  "JourneyLog",
  "Vehicle",
  "PaymentSchedule",
  "Tender",
  "Contractor",
  "ClientContact",
  "Client",
  "Staff",
  "Region"
RESTART IDENTITY CASCADE;

COMMIT;
