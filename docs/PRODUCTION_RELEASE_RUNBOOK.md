# SAEC ERP — Production Release Runbook

Release: In-Out Register customer bricks (`f842437..9165791`, branch
`feat/inout-mandatory-fields`). Live site: `https://erp.adelphostech.com`
(45.113.226.115).

> The deploy scripts in this repo are **fail-closed**. Nothing here connects
> to or modifies production until every unknown below is verified and
> recorded in `deploy/production.env` (gitignored).

## 0. Live configuration (verified read-only on 2026-10-24)

| Value | Verified |
|---|---|
| `DEPLOY_HOST` | `45.113.226.115` (erp.adelphostech.com) |
| `DEPLOY_USER` | `root` (password auth — provided by operator; consider key auth) |
| `DEPLOY_DIR` | `/var/www/erp.adelphostech.com` |
| `PM2_APP` | `erp-adelphos` — **NOT** `saec-erp` as the demo scripts assume |
| `PM2 cwd` | `/var/www/erp.adelphostech.com/.next/standalone` — the deploy script's private_uploads symlink step is **required** |
| `DB_NAME` | `saec_erp` @ 127.0.0.1:5432 |
| `EXPECTED_HOSTNAME` | `ip-45-113-226-115` |
| `EXPECTED_CURRENT_SHA` | `f84243787084f4686e2e41885eea74d4d644aa6e` (= `origin/main` tip) |
| `SITE_URL` | `https://erp.adelphostech.com` |
| Uploads on live | `private_uploads`/`public/uploads` do not exist yet — no files to preserve |

⚠️ The server also hosts unrelated apps (`linkmeu`, `slotcare`,
`oppoint_booking`) — keep every rsync/restart scoped to `erp-adelphos`
paths only.

## 1. Pre-flight (read-only)

1. Verify the server is the real live host — DNS + hostname + SHA checks are
   built into the deploy script (Phase A) and it aborts on mismatch.
2. Record the live baseline:
   ```bash
   psql -d $DB_NAME -Atc "SELECT count(*) FROM \"InOutRegister\""
   psql -d $DB_NAME -Atc "SELECT migration_name FROM _prisma_migrations
     ORDER BY started_at DESC LIMIT 5"
   du -sh $DEPLOY_DIR/private_uploads $DEPLOY_DIR/public/uploads
   ```
3. Confirm pending migrations are EXACTLY:
   `20261024090000_inout_docrefno_unique`,
   `20261024100000_mode_master_letterpad`,
   `20261024110000_pending_inout_uploads`. If live history/drift differs
   from this expectation, STOP — do not improvise schema changes.

## 2. Backups (mandatory, verified)

The deploy script (Phase B) performs and pulls all of these; verify each
exists and checksum matches before proceeding:

- `pg_dump -Fc` of the live database → `deploy/backups/<timestamp>/db.dump`
- `tar` of `private_uploads/` + `public/uploads/` → `uploads.tgz`
- `sha256sum` of both, recorded in the release log
- **Off-server copies pulled to the operator machine** — a backup that only
  exists on the machine being modified is not a backup.
- Restore rehearsal (once, before the real window): restore the dump into a
  disposable DB and confirm record counts match the snapshot taken in §1.

## 3. Release

```bash
# review the dry run first — it prints every remote action
scripts/deploy-production.sh

# execute only after the plan is reviewed
scripts/deploy-production.sh --execute
```

The script enforces, in order:

1. Config completeness + demo-host rejection + absolute `DEPLOY_DIR`.
2. Hostname / current-SHA / PM2-cwd verification (all abort on mismatch).
3. Migration-history cleanliness + **duplicate document-number preflight**
   (aborts if `lower(btrim(documentRefNo))` duplicates exist — the unique
   index cannot be applied).
4. DB + uploads backup with checksums, pulled off-server.
5. `rsync --delete` **with uploads/env/.next excluded** — runtime uploads
   can never be deleted by the sync.
6. `npx prisma migrate deploy` — **never `db push`**, which cannot create
   the functional expression indexes this release requires.
7. Post-migration index verification: `InOutRegister_documentRefNo_key`,
   `ModeMaster_name_key`, `PendingInOutUpload_storedName_key` must exist.
8. Build, standalone static copies, `pm2 restart` (only after PM2 cwd was
   verified to equal `DEPLOY_DIR` — otherwise `private_uploads` resolves to
   the wrong directory).
9. HTTP smoke checks against `$SITE_URL`.

## 4. Post-release smoke tests

- Login → dashboard loads
- In-Out Register: create Inward (mandatory doc no + staff; Informative vs
  Action Required; Reply Due only for Action Required)
- Create Outward; attempt a duplicate document number in the other
  direction → must be rejected
- Mode Master: create/edit/deactivate; inactive mode absent from new form
- PDF: upload → same-screen preview → save → reopen → preview again
- Settings → Export: CSV begins with UTF-8 BOM (open in Excel), XLSX opens
  cleanly, Gujarati text intact
- Fund Flow: project list, monthly report, cumulative balance
- Serial numbers continue from the previous counter (`INW/2026-27/005+`)
- Record counts in `InOutRegister`/`InOutRegisterDocument` vs §1 snapshot +
  the new test entries

## 5. Rollback

The three migrations are **additive only** — no columns dropped, no data
rewritten — so a code rollback does not require a database rollback:

```bash
ssh $DEPLOY_USER@$DEPLOY_HOST
cd $DEPLOY_DIR && git checkout f842437
npm run build && pm2 restart $PM2_APP --update-env
```

If the new code corrupted data (not expected): restore
`deploy/backups/<timestamp>/db.dump` via `pg_restore` into a staging DB
first, verify, then swap. Never drop financial or register tables as a
"rollback".

## 6. Known residual risks

- **Legacy `/uploads/` files** remain readable by any authenticated user
  (session-gated, no per-record check) — unchanged by this release; the new
  In-Out path is private. Mitigation is a separate reviewed move.
- `Asset_responsiblePersonId_idx` exists in schema but is missing on the
  live DB (pre-existing drift from past `db push`) — unrelated; flag to
  infra.
- **Shared host:** `linkmeu`, `slotcare` and `oppoint_booking` run on the
  same server — never run broad `pm2 restart all`, and keep rsync strictly
  scoped to `DEPLOY_DIR`.
- PM2 cwd is the standalone build dir — handled by the persistent
  `private_uploads` symlink step in Phase E (verified needed on live).
