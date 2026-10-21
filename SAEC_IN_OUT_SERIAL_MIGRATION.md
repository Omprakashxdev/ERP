# SAEC ERP — Permanent Register Serials: Migration Proposal

HEAD `b0f397a` + working-tree changes · 21 Oct 2026
Policy (customer-approved): `INW|OUT/YYYY-YY/NNN`, FY Apr 1–Mar 31 IST, permanent non-recycled numbers, server-authoritative issuance.

## STOPPED BEFORE MIGRATION — awaiting explicit approval

Everything below is implemented and validated on a **disposable DB** (`saec_erp_serial_test`, created + migrated + tested + separate from `saec_erp_manual_test`). No existing database was migrated.

---

## Files changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | `serialNo` → `@unique`; new `RegisterSerialCounter` model; removed redundant `@@index([serialNo])` (the unique index covers it) |
| `prisma/migrations/20261021150000_register_serial_counter/migration.sql` | new idempotent migration |
| `src/lib/register-serial.ts` | **new** — atomic issuance + counter bump |
| `src/lib/actions/in-out-register.ts` | create path → transactional issuance; client `serialNo` ignored; preview reads counter |
| `src/lib/actions/export-import.ts` | bulk import → transaction + server issuance; CSV-supplied serials preserved and bump the counter; docRef→serial copy removed (identifiers no longer merged) |
| `src/lib/__tests__/in-out-serial-issuance.int.test.ts` | **new** — 13 disposable-DB integration tests |
| `src/lib/__tests__/in-out-serial-generator.int.test.ts` | trimmed to preview-scan coverage |
| `src/lib/__tests__/in-out-bulk-import.test.ts` | mocks updated for transaction + counter stubs |

## The exact migration SQL

```sql
CREATE TABLE IF NOT EXISTS "RegisterSerialCounter" (
    "scope" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RegisterSerialCounter_pkey" PRIMARY KEY ("scope")
);
ALTER TABLE "InOutRegister" ADD COLUMN IF NOT EXISTS "serialNo" TEXT;
ALTER TABLE "InOutRegister" ALTER COLUMN "documentRefNo" DROP NOT NULL;
DROP INDEX IF EXISTS "InOutRegister_serialNo_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "InOutRegister_serialNo_key" ON "InOutRegister"("serialNo");

-- Initialize counters from already-issued serials (history preserved)
INSERT INTO "RegisterSerialCounter" ("scope", "lastSeq")
SELECT split_part("serialNo",'/',1)||'/'||split_part("serialNo",'/',2),
       MAX(NULLIF(regexp_replace(split_part("serialNo",'/',3),'[^0-9]','','g'),'')::int)
FROM "InOutRegister"
WHERE "serialNo" ~ '^(INW|OUT)/\d{4}-\d{2}/\d+$'
GROUP BY 1
ON CONFLICT ("scope") DO NOTHING;
```

## Existing-data preservation checks (run before approving)

| Check | Result (isolated DB) |
|---|---|
| Duplicate `serialNo` present | **none** — unique index will apply cleanly |
| NULL `serialNo` rows | allowed — Postgres `UNIQUE` ignores NULLs; legacy rows keep NULL |
| Non-standard serials (free-form) | unaffected — only `INW|OUT/FY/NNN` pattern seeds counters |
| `documentRefNo` nullable | already true on both DBs — no data change |
| Historical serials renumbered | **none** — counters initialize from existing maxima, records untouched |

**Limitation disclosed:** issuance history (which numbers were ever issued then deleted) is unavailable; counters initialize to the maximum *surviving* serial, so numbers that existed on deleted records may be reissued once (post-migration recycling is impossible).

## Cutover procedure (proposed — do NOT run yet)

```bash
# 1. Backup
pg_dump -Fc saec_erp > /backups/saec_erp_pre_serial_$(date +%F).dump

# 2. Write-blocking window (brief): put app in maintenance
#    or simply run during low traffic — the migration is seconds-fast.
#    Postgres takes a brief lock on InOutRegister for the unique index.

# 3. Apply
npx prisma migrate deploy   # or: psql saec_erp -f migration.sql

# 4. Verify
#    SELECT * FROM "RegisterSerialCounter";  -- one row per scope
#    SELECT count(*), serialNo FROM "InOutRegister" GROUP BY 2 HAVING count(*)>1;  -- 0 rows

# 5. Deploy code (build includes the new issuance path)

# Restore if needed:
pg_restore -c -d saec_erp /backups/saec_erp_pre_serial_<date>.dump
```

Write-blocking: the unique-index build takes a short `ACCESS EXCLUSIVE` lock on `InOutRegister` (~ms on a small table). During that window writes queue briefly — no downtime beyond it. Counter init is part of the same migration — no drift window.

## Verified results

| Requirement | Result |
|---|---|
| INW independent `001, 002` | ✓ |
| OUT independent `001` | ✓ |
| 31 Mar 23:59:59 IST → `INW/2026-27/NNN`; 1 Apr 00:00 IST → `INW/2027-28/001` | ✓ exact boundary |
| 009→010, 099→100, 999→1000 | ✓ |
| **20 parallel creates → 20 unique consecutive serials** | ✓ (set size 20, range exactly +1..+20) |
| Failed create → counter rolled back (no gap debt) | ✓ |
| Edit never renumbers | ✓ |
| Deleted serials never reused | ✓ |
| Forged client serial ignored | ✓ (`X/FORGED/999` → server-issued) |
| Serial-like `documentRefNo` doesn't alter counter | ✓ (+1 only) |
| Counter init from existing max | ✓ (777 → next 778) |
| DB rejects direct duplicate insert | ✓ unique violation |
| Preview matches next counter | ✓ |
| Reply Ref. No separate & functional | ✓ (reply = outward row + parentInwardId, unchanged) |

## Browser verification (disposable DB, real UI)
- New Inward → `INW/2026-27/780` issued, saved, grid shows it
- New Outward → `OUT/2026-27/024` issued, saved, independent sequence
- Form preview field shows the *next* number (non-authoritative hint only)

## Automated results
- `npx vitest run` — **437 pass** (19 skipped: the opt-in integration suites)
- `RUN_INTEGRATION_TESTS=1` against disposable DB — **13/13 pass**
- `tsc --noEmit` — clean · `eslint` — clean · `npm run build` — clean

## Remaining blockers
1. **Apply the migration** — needs your approval (SQL + backup steps above)
2. Old Contabo server still down — its real `saec_erp` data unrecovered
3. `/uploads` record-level authz — pre-existing, unrelated

**Awaiting your explicit approval to apply `20261021150000_register_serial_counter` to `saec_erp` (and redeploy).**
