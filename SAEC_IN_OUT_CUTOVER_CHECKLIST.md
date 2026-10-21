# SAEC ERP — Final Controlled Cutover Gate

**HEAD `3e029a3`** · 21 Oct 2026 · **EXECUTION NOT YET AUTHORIZED — STOP**

Target: `45.113.226.115` · `/var/www/erp.adelphostech.com` · pm2 `erp-adelphos` (`:3005`) · DB `saec_erp`

---

## Gate items — all verified

### 1. Fresh backup ✓ (captured today)
| | |
|---|---|
| Server copy | `/var/backups/saec_erp/cutover_20261021_1059.dump` (157 KB, postgres:postgres) |
| Local copy | `backups/cutover_20261021_1059.dump` |
| SHA-256 | `0f163a2a7a137bf66c34a097d5d701bbd41a58aa4d9ad5df8ed508e6a4d23878` — identical both locations |
| Restore proof | restored into isolated `saec_erp_backup_verify` — all 4 serials + 6 tasks intact |

### 2. Process isolation ✓
pm2 shows `erp-adelphos` (id 3, online, 184 MB) + `linkmeu` + `slotcare` — **only `erp-adelphos` is stopped**, others never touched.
Cron inventory: only slotcare backup/health jobs — **nothing else writes to `saec_erp`**. The single ERP app process is the only write path (server actions, bulk import, NextAuth sessions). No second instance, no workers.

### 3. Before-state recorded ✓
```
id                        | serialNo         | dir    | docRef  | parent
cmvhv6gri0001s1khrnhhkj0q | INW/2026-27/001  | INWARD | (null)  | (null)
cmvhx4yhs000ds1khpl1qfccv | INW/2026-27/002  | INWARD | tetet   | (null)
cmvhx57hc000hs1kh03myrt8e | INW/2026-27/003  | INWARD | ererer  | (null)
cmvhx5d00000ls1khpw7iucvq | INW/2026-27/004  | INWARD | etetett | (null)
```
0 dupes · 0 malformed · 0 orphan replies · 6 tasks, links intact.
**Post-cutover comparison: identical rows, plus `RegisterSerialCounter` (`INW/2026-27 → 4`).**

### 4. Migration-history baselining — SAFE, rehearsed
Target DB was `db push`-managed (no `_prisma_migrations`). Strategy:
```bash
cd /var/www/erp.adelphostech.com
for m in prisma/migrations/*/; do
  npx prisma migrate resolve --applied "$(basename "$m")" --skip-generate
done
```
Each `resolve --applied` only inserts a history row — **zero schema change**. Verified against the cloned schema: every existing migration's objects already exist in `saec_erp`. Then `migrate deploy` applies **only** `20261021150000_register_serial_counter`.

### 5. Migration is purely additive ✓
Creates counter table + unique index + seeds counters from existing serials. **No UPDATE/DELETE on `InOutRegister`** — the 4 records are byte-identical after migration (rehearsed on the production clone).

---

## Exact cutover commands (DO NOT RUN — awaiting authorization)

```bash
ssh root@45.113.226.115

# ── STEP 0: last-minute backup diff (row count sanity) ────────────────
su postgres -c "psql saec_erp -t -A -c 'SELECT count(*) FROM \"InOutRegister\"'"
# must print 4 — if not, STOP and re-verify

# ── STEP 1: block writes (only the ERP process) ───────────────────────
pm2 stop erp-adelphos
# nginx will serve 502 for the ERP app — all writes impossible now

# ── STEP 2: fresh hot backup right before cutover ─────────────────────
su postgres -c "pg_dump -Fc saec_erp -f /var/backups/saec_erp/final_pre_cutover.dump"
sha256sum /var/backups/saec_erp/final_pre_cutover.dump

# ── STEP 3: baseline migration history ────────────────────────────────
cd /var/www/erp.adelphostech.com
for m in prisma/migrations/*/; do
  npx prisma migrate resolve --applied "$(basename "$m")" --skip-generate
done
# expected: ~13 migrations marked applied, 0 errors, no DDL run

# ── STEP 4: deploy code (contains the migration) ──────────────────────
git pull origin main        # brings 30ac030 + 3e029a3
npm run build
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
# .env untouched — keep the corrected DATABASE_URL

# ── STEP 5: apply ONLY the new migration ──────────────────────────────
npx prisma migrate deploy
# expected: "1 migration applied: 20261021150000_register_serial_counter"

# ── STEP 6: verify before restart ─────────────────────────────────────
su postgres -c "psql saec_erp -f -" <<'SQL'
SELECT * FROM "RegisterSerialCounter";                       -- INW/2026-27 → 4
SELECT count(*) FROM "InOutRegister";                        -- 4
SELECT serialNo FROM "InOutRegister" GROUP BY 1 HAVING count(*)>1 AND serialNo IS NOT NULL;  -- 0 rows
SELECT indexname FROM pg_indexes WHERE tablename='InOutRegister' AND indexname ILIKE '%serial%';
SQL

# ── STEP 7: restart ───────────────────────────────────────────────────
pm2 restart erp-adelphos
pm2 logs erp-adelphos --lines 30   # confirm clean startup

# ── STEP 8: post-cutover functional test (browser/API) ────────────────
# New Inward  → must show/issue INW/2026-27/005
# New Outward → must show/issue OUT/2026-27/001 (independent)
# Second Inward → INW/2026-27/006 (monotonic)
# 4 historical rows unchanged · docRef still manual field · reply flow intact
```

---

## Rollback decision tree (never blind-restore)

```
Did migrate deploy succeed?
├─ NO → migration SQL is idempotent; nothing changed → restart app, done.
│       Check error; if unique-index failed → pre-existing dupe appeared
│       between check and apply → find it, DO NOT force. STOP.
└─ YES → app broken after restart?
        ├─ NO (all good) → done.
        └─ YES →
            Any NEW rows written to InOutRegister since cutover?
            ├─ NO new rows → pg_restore -c -d saec_erp final_pre_cutover.dump
            │                git checkout b0f397a → rebuild → pm2 restart
            └─ YES new rows exist → DO NOT pg_restore -c (would lose them)
                    → Surgical rollback instead:
                      pm2 stop erp-adelphos
                      psql saec_erp -c 'DROP TABLE "RegisterSerialCounter";
                                        DROP INDEX "InOutRegister_serialNo_key";'
                      git checkout b0f397a → rebuild → pm2 restart
                      (issued serials remain valid; uniqueness just relaxed)
```

**Rule: `pg_restore -c` is the *last* resort and only when zero new records exist post-cutover.**

---

## Remaining checks before GO
- [ ] 4-vs-record-count sanity (Step 0) — verify no new rows since this backup
- [ ] Confirm maintenance window (~60–90 s write pause acceptable)
- [ ] Your explicit authorization

**STOP — awaiting explicit approval to execute the cutover sequence.**
