# ERP Implementation Plan — Step 2: Database Schema & Zod Types (Fund Flow)

## Context
Step 1 is complete: Next.js 16 + React 19 + TypeScript + Tailwind v4 + shadcn/ui (zinc theme) + Prisma 6 + NextAuth.js v5 + PostgreSQL, with foundational `User`, `AuditLog`, and `Role` models.

This plan covers Step 2 only: designing and creating the Prisma schema and Zod validation layer for the **Fund Flow** module, based on the exact fields in `docs/saec fund flow - Format.xlsx` and the project details in `docs/PRIMARY INFORMATION erp modules25062026.docx`.

## Source fields to model
From `docs/saec fund flow - Format.xlsx`:
- Region Name
- Client Name
- Project Name
- Date of Work Order
- Time Limit (in Month)
- Stipulated Date of Completion
- Target Date of Completion
- Target Time Limit (In Month)
- Team Leader / Project Manager
- Residential Engineer
- Design Engineer
- Site Engineer
- Misc Exp
- Staff Exp.
- Total Project Cost
- completed work amt
- remaining work amt
- Total Fee
- Proposed / Due Bill Amount
- fee recvd

## Recommended schema approach

### 1. Add Prisma enums

```prisma
enum ProjectStatus {
  ACTIVE
  COMPLETED
  ON_HOLD
  CANCELLED
}

enum WorkType {
  BUILDING
  WATER_SUPPLY
  UGD
  ROAD
  OTHER
}

enum ServiceType {
  DPR
  SUPERVISION
  PMC
  TPI
  OTHER
}

enum ProjectRole {
  TEAM_LEADER
  PROJECT_MANAGER
  RESIDENTIAL_ENGINEER
  DESIGN_ENGINEER
  SITE_ENGINEER
  OTHER
}
```

### 2. Add shareable master-data models

- **Region** — `id`, `name` (unique), `abbreviation`, `address`, timestamps.
- **Client** — `id`, `name`, `abbreviation` (8 chars), `address`, timestamps.
- **ClientContact** — linked to Client; name, email, phone.
- **Staff** — `id`, `name`, `email` (unique), `phone`, `employeeCode` (unique), `designation`, optional `regionId`, `isActive`, timestamps.

These models are intentionally reusable by Due Bills, WIP, HR, and future modules.

### 3. Add Project model

```prisma
model Project {
  id                     String        @id @default(cuid())
  regionId               String
  clientId               String
  name                   String
  abbreviation           String?       @db.VarChar(8)
  address                String?
  agreementDate          DateTime?
  workOrderDate          DateTime
  timeLimitMonths        Decimal       @db.Decimal(8,4)
  additionalTimeMonths   Decimal?      @db.Decimal(8,4)
  targetTimeLimitMonths  Decimal?      @db.Decimal(8,4)
  stipulatedCompletionDate DateTime?
  targetCompletionDate   DateTime?
  estimatedCost          Decimal       @db.Decimal(19,2) @default("0.00")
  totalFee               Decimal       @db.Decimal(19,2) @default("0.00")
  status                 ProjectStatus @default(ACTIVE)
  workType               WorkType
  serviceType            ServiceType
  contractorId           String?
  createdAt              DateTime      @default(now())
  updatedAt              DateTime      @updatedAt

  region       Region?            @relation(fields: [regionId], references: [id])
  client       Client             @relation(fields: [clientId], references: [id])
  contractor   Contractor?        @relation(fields: [contractorId], references: [id])
  assignments  ProjectAssignment[]
  feeStages    ProjectFeeStage[]
  fundFlow     FundFlow?

  @@unique([clientId, name])
  @@index([regionId])
  @@index([clientId])
  @@index([status])
  @@index([workOrderDate])
}
```

### 4. Add supporting models

- **Contractor** — name, contact person, phone, email, address, contract amount, agreement date, work order date.
- **ProjectAssignment** — `projectId`, `staffId`, `role` (enum), optional `allocation` Decimal(5,2). Links Project and Staff.
- **ProjectFeeStage** — `projectId`, `stageName`, `percentage`, `amount`, `dueDate`. Supports the stage-wise project fees mentioned in the primary info doc.
- **FundFlow** — one record per project, storing the Fund Flow worksheet fields:
  - `projectId` (unique, 1:1 with Project)
  - `miscExp` Decimal(19,2)
  - `staffExp` Decimal(19,2)
  - `totalProjectCost` Decimal(19,2)
  - `completedWorkAmt` Decimal(19,2)
  - `proposedDueBillAmount` Decimal(19,2)
  - `feeReceived` Decimal(19,2)
  - timestamps

### 5. Computed vs stored fields

| Field | Stored? | Source / Computation |
|---|---|---|
| `stipulatedCompletionDate` | Stored | Default computed as `workOrderDate + timeLimitMonths`; user can override. |
| `targetTimeLimitMonths` | Stored | Default computed as `timeLimitMonths + (additionalTimeMonths \|\| timeLimitMonths × 0.5)`. |
| `targetCompletionDate` | Stored | Default computed as `workOrderDate + targetTimeLimitMonths`; user can override. |
| `remainingWorkAmt` | Computed at read time | `FundFlow.totalProjectCost - FundFlow.completedWorkAmt` |
| `remainingFee` | Computed at read time | `Project.totalFee - FundFlow.feeReceived` |
| `totalProjectCost` | Stored in `FundFlow` | Defaults to `Project.estimatedCost` on creation, editable later. |

### 6. Zod validation files to create

- `src/lib/schemas/shared.ts` — reusable helpers:
  - `money` schema (string/number → Prisma.Decimal, 2 decimals)
  - `months` schema (string/number → Prisma.Decimal, up to 4 decimals, > 0)
  - `cleanedString(max)`
  - `optionalCuid`

- `src/lib/schemas/region.ts` — create/update for Region.
- `src/lib/schemas/client.ts` — create/update for Client + ClientContact.
- `src/lib/schemas/staff.ts` — create/update for Staff.
- `src/lib/schemas/project.ts` — full Project create/update including assignments and fee stages.
- `src/lib/schemas/fund-flow.ts` — FundFlow create/update and a filter/query schema.

Example Fund Flow schemas:

```ts
export const fundFlowCreateSchema = z.object({
  projectId: z.string().cuid(),
  miscExp: money.default(new Prisma.Decimal("0.00")),
  staffExp: money.default(new Prisma.Decimal("0.00")),
  totalProjectCost: money.default(new Prisma.Decimal("0.00")),
  completedWorkAmt: money.default(new Prisma.Decimal("0.00")),
  proposedDueBillAmount: money.default(new Prisma.Decimal("0.00")),
  feeReceived: money.default(new Prisma.Decimal("0.00")),
});

export const fundFlowUpdateSchema = fundFlowCreateSchema
  .partial()
  .extend({ projectId: z.string().cuid() });

export const fundFlowFilterSchema = z.object({
  regionId: z.string().cuid().optional(),
  clientId: z.string().cuid().optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  workType: z.nativeEnum(WorkType).optional(),
  serviceType: z.nativeEnum(ServiceType).optional(),
  workOrderDateFrom: z.coerce.date().optional(),
  workOrderDateTo: z.coerce.date().optional(),
  search: z.string().optional(),
});
```

### 7. Type helpers

- `src/types/fund-flow.ts` — derived TypeScript types from Zod schemas and a read-row type that includes computed fields (`remainingWorkAmt`, `remainingFee`) and related names (`regionName`, `clientName`).

### 8. Migration

After schema update:

```bash
npm run db:migrate
# Name: add_fund_flow_module
npx prisma generate
```

## Out of scope for Step 2
- Server actions / API routes (Step 3).
- AI/LLM integration (Step 4).
- Frontend UI pages and tables (Step 5).
- Seeding sample Fund Flow data.

## Verification
- `npx prisma generate` succeeds.
- `npx prisma validate` passes.
- `npm run build` still passes (no TypeScript errors from new schemas).

## Next step after approval
**Step 3: Secure Server Actions / API Routes** — build RBAC-enforced server actions for creating/updating Regions, Clients, Staff, Projects, and FundFlow records, with audit logging and rate limiting.
