# SAEC ERP — Serial Migration Preflight (Approval Package)

**HEAD `30ac030`** · 21 Oct 2026 · **No migration applied to any existing DB · no deploy · no push**

---

## 1. Confirmed deployment target

| Check | Evidence |
|---|---|
| Public DNS (8.8.8.8) | `erp.adelphostech.com` → **45.113.226.115** (1.1.1.1 still caching old — propagation) |
| Live connection | `curl https://erp.adelphostech.com` connects to **45.113.226.115**, app responds 200 on `:3005` |
| Old server `156.67.105.64` | SSH port 22 **refused**, HTTP refused — **dead**, it is the legacy host only |

**Relationship:** `156.67.105.64` = former Contabo VPS (crashed 20 Oct, all services down — still unreachable). `45.113.226.115` (IND-EX6) = replacement where ERP was re-deployed on 21 Oct. **ERP production lives exclusively on `45.113.226.115`.**

| Target facts | |
|---|---|
| App dir | `/var/www/erp.adelphostech.com` |
| Branch | `main` (deployed `b0f397a`) |
| Method | git pull → `npm run build` → copy `.next/static` into `standalone/` → `pm2 restart erp-adelphos` → nginx→`127.0.0.1:3005` |
| Database | PostgreSQL `saec_erp`, localhost on same VPS |

## 2. Target database state (read-only checks)

| Check | Result |
|---|---|
| `InOutRegister` rows | 4, all serialised `INW/2026-27/001`–`004` |
| Duplicate serials | **0** |
| Malformed serials | **0** |
| Orphan `parentInwardId` | **0** |
| `_prisma_migrations` table | **absent** — DB was schema-synced via `db push` |
| `RegisterSerialCounter` | absent (as expected) |
| `serialNo` index | non-unique `InOutRegister_serialNo_idx` — migration drops + replaces with UNIQUE |

## 3. Exact migration SQL
`prisma/migrations/20261021150000_register_serial_counter/migration.sql` — idempotent, printed in `SAEC_IN_OUT_SERIAL_MIGRATION.md`. Summary: create counter table → ensure `serialNo` column → drop old index → create `UNIQUE` index → seed counters from well-formed existing serials (`ON CONFLICT DO NOTHING`).

## 4. Rehearsal on a disposable clone of the production DB

Dumped live `saec_erp` (`pg_dump -Fc`, 157 KB) → restored to local `saec_erp_rehearsal` → applied the migration SQL → verified:

| Check | Result |
|---|---|
| Migration applies cleanly | ✓ (idempotent on db-push schema) |
| Counter init from real data | `INW/2026-27 → lastSeq 4` |
| All 4 serials preserved | ✓ unchanged |
| Next issue after migration | `INW/2026-27/005` — correct continuation |
| Unique index active | `InOutRegister_serialNo_key` present |
| Direct duplicate insert | **rejected**: `duplicate key value violates unique constraint` |
| Tasks/replies/docRefs | preserved (6 tasks, links intact) |

## 5. Backup restore proof
The same `pg_dump -Fc` backup restored cleanly into a second isolated DB `saec_erp_restore_check` (verified row counts). Rollback = restore the dump (`pg_restore -c`) — proven possible.

## 6. Migration-history reconciliation (db-push DB)

`_prisma_migrations` absent → `migrate deploy` would try every historical migration. Strategy:

```bash
# On server, mark every existing migration as applied (they are — via db push):
for m in prisma/migrations/*/; do
  npx prisma migrate resolve --applied "$(basename $m)" --skip-generate
done
# then the new migration applies alone:
npx prisma migrate deploy
```
`migrate resolve --applied` only inserts history rows — zero schema change. **Alternative** (simpler, rehearsed): run `migration.sql` manually + `migrate resolve --applied 20261021150000_register_serial_counter`.

## 7. Import concurrency safety
- `issueRegisterSerialNo` and `bumpRegisterSerialCounter` are single atomic `INSERT..ON CONFLICT` statements on one counter row — Postgres row-lock serialises concurrent import+create; verified 20-parallel creates → 20 unique consecutive serials.
- CSV-supplied serial that conflicts → unique violation → **that row errors, import continues** (per-row try/catch, line ~782); counter bump is inside the row's transaction → rolls back with it, no corruption.
- CSV-supplied well-formed serial → stored + counter raised via `GREATEST` → future issues skip it.

## 8. Cutover sequence (write-blocking)

```bash
# 1. Backup (verified restorable above)
pg_dump -Fc saec_erp -f /backups/saec_erp_pre_serial_$(date +%F).dump

# 2. Stop app writes — pm2 stop erp-adelphos  (~30s window)
pm2 stop erp-adelphos

# 3. Reconcile history + apply migration
for m in prisma/migrations/*/; do npx prisma migrate resolve --applied "$(basename $m)" --skip-generate; done
npx prisma migrate deploy   # applies ONLY the new one

# 4. Deploy new code (build already validated locally)
git pull && npm run build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/

# 5. Start
pm2 restart erp-adelphos

# Verify: SELECT * FROM "RegisterSerialCounter";  → INW/2026-27 → 4
```

**Rollback:** `pm2 stop` → `pg_restore -c -d saec_erp backup.dump` → `git checkout b0f397a` → rebuild → restart.

## 9. Historical limitation (disclosed, not fixable)
Numbers issued then deleted **before** counter tracking existed cannot be reconstructed — counters initialise from the maximum *surviving* serial. E.g., if `INW/2026-27/003` had been deleted pre-migration, counter starts at 4→`005` only if 004 survives; deleted `00x` values could be reissued once. Post-migration, recycling is impossible.

## 10. Identifier independence
- `documentRefNo` — manual free text, never touches counters (verified: serial-like docRef bumps counter only +1 via issuance, docRef stays as typed)
- `replyRefNo` — separate `@unique` column, unchanged
- Reply workflow — reply = an OUTWARD row + `parentInwardId`; unchanged

## 11. GO / NO-GO

**GO** — ready to apply on approval:

- ✓ Target DB has zero dupes/malformed → unique index applies cleanly
- ✓ Migration rehearsed on a clone of real production data — counters initialised correctly, all records preserved
- ✓ Backup proven restorable
- ✓ Concurrency + rollback-safe issuance verified (13/13 integration tests)
- ⚠ Requires ~30-second write pause during `pm2 stop` → `migrate deploy` → restart
- ⚠ `migrate resolve` step needed because the DB was `db push`ed (no history table)

**Awaiting explicit approval** to run the cutover sequence on `45.113.226.115`.
