#!/usr/bin/env bash
# =============================================================================
# SAEC ERP — production deployment (fail-closed).
#
# This script CANNOT accidentally deploy:
#   - every step is a dry run unless --execute is passed
#   - it requires deploy/production.env with every field verified on the live
#     server (see deploy/production.env.example)
#   - the known demo/old host 156.67.105.64 is hard-rejected
#   - it NEVER runs `prisma db push` or --accept-data-loss — only
#     `prisma migrate deploy`, which is the only mechanism that applies the
#     functional unique indexes this release needs
#   - it aborts if the pending-migration set, duplicate preflight, PM2 cwd or
#     current server SHA differs from what was verified
#
# Usage:
#   scripts/deploy-production.sh              # dry run — prints every action
#   scripts/deploy-production.sh --execute    # real deploy after review
#
# Prerequisites on the operator machine: ssh-agent/key authorized for
# DEPLOY_USER@DEPLOY_HOST, rsync, scp, sha256sum or shasum.
# =============================================================================
set -euo pipefail

EXECUTE=0
[[ "${1:-}" == "--execute" ]] && EXECUTE=1
[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && { sed -n '2,20p' "$0"; exit 0; }

ENV_FILE="deploy/production.env"
KNOWN_DEMO_HOST="156.67.105.64"
EXPECTED_INDEXES=(
  "InOutRegister_documentRefNo_key"
  "ModeMaster_name_key"
  "PendingInOutUpload_storedName_key"
)
UPLOAD_DIRS=("private_uploads" "public/uploads")

fail() { echo "FAIL: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }

# ---------------------------------------------------------------------------
# Load + validate configuration (never defaults)
# ---------------------------------------------------------------------------
step "Loading $ENV_FILE"
[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE missing — copy deploy/production.env.example and verify every value on the live server"
# shellcheck source=/dev/null
source "$ENV_FILE"

for v in DEPLOY_HOST DEPLOY_USER DEPLOY_DIR PM2_APP DB_NAME DB_USER SITE_URL; do
  [[ -n "${!v:-}" ]] || fail "$v is empty in $ENV_FILE"
done

[[ "$DEPLOY_HOST" == "$KNOWN_DEMO_HOST" ]] && \
  fail "DEPLOY_HOST=$KNOWN_DEMO_HOST is the known DEMO/old host — refusing to deploy"

[[ "$DEPLOY_DIR" == /* && "$DEPLOY_DIR" != "/" ]] || \
  fail "DEPLOY_DIR must be an absolute non-root path (got '$DEPLOY_DIR')"

# A backup that was never restore-tested is not a backup. The operator must
# attest (in the env file or environment) that the latest db.dump restored
# cleanly into a disposable database with matching record counts.
if [[ $EXECUTE -eq 1 && "${RESTORE_REHEARSAL_DONE:-}" != "yes" ]]; then
  fail "RESTORE_REHEARSAL_DONE=yes required in $ENV_FILE — restore the latest backup into a disposable DB and verify record counts before releasing"
fi

REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"
SSH="ssh -o BatchMode=yes -o ConnectTimeout=10"
DATE_TAG="$(date +%Y%m%d_%H%M)"
BACKUP_DIR="deploy/backups/${DATE_TAG}"

echo "  target:   ${REMOTE}:${DEPLOY_DIR}"
echo "  pm2 app:  ${PM2_APP}"
echo "  database: ${DB_NAME} (role ${DB_USER})"
echo "  mode:     $([ $EXECUTE -eq 1 ] && echo EXECUTE || echo DRY-RUN)"

# run <ssh command...> — always printed, executed only with --execute
run() {
  echo "  \$ $*"
  [[ $EXECUTE -eq 1 ]] || return 0
  "$@"
}
remote() { run $SSH "$REMOTE" "$@"; }
remote_sh() { run $SSH "$REMOTE" "bash -s" <<< "$1"; }

# remote_check <description> <command> — reads server state (runs even in
# dry-run? NO — dry run must not connect; these only execute with --execute)
remote_check() {
  local desc="$1"; shift
  echo "  # $desc"
  echo "  \$ $SSH $REMOTE '$*'"
  [[ $EXECUTE -eq 1 ]] || { echo "    (dry-run: skipped)"; return 0; }
  $SSH "$REMOTE" "$@"
}

# ---------------------------------------------------------------------------
step "PHASE A — remote identity + state verification"
# ---------------------------------------------------------------------------
remote_check "hostname must match EXPECTED_HOSTNAME when configured" \
  'hostname'
if [[ $EXECUTE -eq 1 && -n "${EXPECTED_HOSTNAME:-}" ]]; then
  HOST_OUT=$($SSH "$REMOTE" 'hostname') || fail "cannot reach $REMOTE"
  [[ "$HOST_OUT" == "$EXPECTED_HOSTNAME" ]] || \
    fail "remote hostname '$HOST_OUT' != EXPECTED_HOSTNAME '$EXPECTED_HOSTNAME'"
  echo "  hostname verified: $HOST_OUT"
fi

remote_check "current git SHA must equal EXPECTED_CURRENT_SHA" \
  "git -C $DEPLOY_DIR rev-parse HEAD"
if [[ $EXECUTE -eq 1 && -n "${EXPECTED_CURRENT_SHA:-}" ]]; then
  SHA_OUT=$($SSH "$REMOTE" "git -C $DEPLOY_DIR rev-parse HEAD" | tr -d '[:space:]') || \
    fail "cannot read git HEAD at $DEPLOY_DIR"
  [[ "$SHA_OUT" == "$EXPECTED_CURRENT_SHA" ]] || \
    fail "server SHA $SHA_OUT != EXPECTED_CURRENT_SHA $EXPECTED_CURRENT_SHA"
  echo "  server SHA verified: $SHA_OUT"
fi

remote_check "PM2 process exists; cwd must be DEPLOY_DIR or DEPLOY_DIR/.next/standalone" \
  "pm2 describe $PM2_APP | grep -i 'cwd' | head -1"
if [[ $EXECUTE -eq 1 ]]; then
  PM2_CWD=$($SSH "$REMOTE" "pm2 describe $PM2_APP | grep -i 'cwd' | head -1 | sed 's/.*cwd[^/]*//;s/ *│.*//' | tr -d ' '") || \
    fail "PM2 app '$PM2_APP' not found — refusing to restart an unverified process"
  if [[ "$PM2_CWD" == "$DEPLOY_DIR/.next/standalone" ]]; then
    PM2_STANDALONE_CWD=1
    echo "  PM2 cwd is the standalone build dir — the private_uploads symlink in Phase E is REQUIRED"
  elif [[ "$PM2_CWD" != "$DEPLOY_DIR" ]]; then
    fail "PM2 cwd '$PM2_CWD' is neither DEPLOY_DIR nor its .next/standalone — private_uploads would resolve to an unverified directory"
  else
    echo "  PM2 cwd verified: $PM2_CWD"
  fi
fi

remote_check "upload directories exist and will be preserved" \
  "for d in ${UPLOAD_DIRS[*]}; do echo \"\$d: \$(test -d $DEPLOY_DIR/\$d && find $DEPLOY_DIR/\$d -type f | wc -l || echo MISSING)\"; done"

step "PHASE A2 — database preflight"
remote_sh "sudo -u postgres psql -d $DB_NAME -Atc '
   SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL'"
remote_sh "sudo -u postgres psql -d $DB_NAME -Atc '
   SELECT lower(btrim(\"documentRefNo\")), count(*) FROM \"InOutRegister\"
   WHERE \"documentRefNo\" IS NOT NULL GROUP BY 1 HAVING count(*) > 1'"
remote "cd $DEPLOY_DIR && npx prisma migrate status"
echo "  # pending set must be EXACTLY the 3 in-out migrations per the runbook — abort if anything else appears"
if [[ $EXECUTE -eq 1 ]]; then
  FAILED_MIG=$($SSH "$REMOTE" "sudo -u postgres psql -d $DB_NAME -Atc 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL'")
  [[ "$FAILED_MIG" == "0" ]] || fail "prisma migration history not clean ($FAILED_MIG failed/rolled-back rows) — resolve before deploying"
  DUPES=$($SSH "$REMOTE" "sudo -u postgres psql -d $DB_NAME -Atc 'SELECT count(*) FROM (SELECT lower(btrim(\"documentRefNo\")) n FROM \"InOutRegister\" WHERE \"documentRefNo\" IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d'")
  [[ "$DUPES" == "0" ]] || fail "$DUPES duplicate normalized document numbers exist — the unique index cannot be applied; fix data first"
  echo "  migration history clean; 0 duplicate document numbers"
fi

# ---------------------------------------------------------------------------
step "PHASE B — verified backups (DB + uploads + checksums, pulled off-server)"
# ---------------------------------------------------------------------------
remote "mkdir -p ~/${DATE_TAG}_backup"
remote "sudo -u postgres pg_dump -Fc -d $DB_NAME -f /tmp/${DATE_TAG}_db.dump && \
  mv /tmp/${DATE_TAG}_db.dump ~/${DATE_TAG}_backup/db.dump && \
  sha256sum ~/${DATE_TAG}_backup/db.dump"
# Upload files may live under EITHER the app root (persistent target) or the
# standalone build dir (process.cwd() hazard) — archive every location that
# exists; missing dirs must not abort the backup.
remote "cd $DEPLOY_DIR && tar czf ~/${DATE_TAG}_backup/uploads.tgz --ignore-failed-read ${UPLOAD_DIRS[*]} .next/standalone/public/uploads .next/standalone/private_uploads 2>/dev/null; sha256sum ~/${DATE_TAG}_backup/uploads.tgz"
remote "sudo -u postgres psql -d $DB_NAME -Atc 'SELECT count(*) FROM \"InOutRegister\"'"
run mkdir -p "$BACKUP_DIR"
run scp "${REMOTE}:~/${DATE_TAG}_backup/db.dump" "$BACKUP_DIR/"
run scp "${REMOTE}:~/${DATE_TAG}_backup/uploads.tgz" "$BACKUP_DIR/"
if [[ $EXECUTE -eq 1 ]]; then
  [[ -s "$BACKUP_DIR/db.dump" && -s "$BACKUP_DIR/uploads.tgz" ]] || \
    fail "backup files not pulled to $BACKUP_DIR — aborting before any code change"
  echo "  local backup copies verified present in $BACKUP_DIR"
fi

# ---------------------------------------------------------------------------
step "PHASE C — code sync (uploads + env + build dirs excluded)"
# ---------------------------------------------------------------------------
RSYNC_EXCLUDES=(
  --exclude '.git' --exclude 'node_modules' --exclude '.next'
  --exclude '.env' --exclude '.env.*' --exclude 'docs'
  --exclude 'private_uploads/' --exclude 'public/uploads/'
  --exclude 'deploy/backups/' --exclude 'backups/' --exclude 'qa-shots/'
)
run rsync -rlptvz --delete --no-owner --no-group "${RSYNC_EXCLUDES[@]}" ./ "$REMOTE:$DEPLOY_DIR/"
echo "  upload dirs, env files and build output are excluded — rsync --delete cannot remove them"

# ---------------------------------------------------------------------------
step "PHASE D — migrations via prisma migrate deploy ONLY"
# ---------------------------------------------------------------------------
remote "cd $DEPLOY_DIR && npx prisma migrate deploy"
IDX_LIST="$(printf "'%s'," "${EXPECTED_INDEXES[@]}")"; IDX_LIST="${IDX_LIST%,}"
remote_sh "sudo -u postgres psql -d $DB_NAME -Atc \"SELECT indexname FROM pg_indexes WHERE indexname IN ($IDX_LIST)\""
if [[ $EXECUTE -eq 1 ]]; then
  IDX=$($SSH "$REMOTE" "sudo -u postgres psql -d $DB_NAME -Atc \"SELECT count(*) FROM pg_indexes WHERE indexname IN ($IDX_LIST)\"")
  [[ "$IDX" == "3" ]] || fail "expected 3 release indexes, found $IDX — functional unique index missing; investigate before restart"
  echo "  all 3 functional/unique indexes verified present"
fi

# ---------------------------------------------------------------------------
step "PHASE E — build + restart"
# ---------------------------------------------------------------------------
# Rescue runtime-written uploads out of the standalone build dir BEFORE the
# build can wipe .next — move them to persistent app-root paths (rsync-excluded).
remote "mkdir -p $DEPLOY_DIR/public/uploads && \
  if [ -d $DEPLOY_DIR/.next/standalone/public/uploads ] && [ ! -L $DEPLOY_DIR/.next/standalone/public/uploads ]; then \
    cp -an $DEPLOY_DIR/.next/standalone/public/uploads/. $DEPLOY_DIR/public/uploads/; \
  fi"
remote "cd $DEPLOY_DIR && npm ci && npx prisma generate && npm run build"
remote "cd $DEPLOY_DIR && cp -r .next/static .next/standalone/.next/static && cp -r public/. .next/standalone/public/"
# PM2 runs from .next/standalone, so process.cwd()-relative storage dirs land
# inside a wiped build dir — this is the original missing-PDF root cause.
# Keep BOTH upload roots at the app root (rsync-excluded, survive rebuilds)
# and point the standalone copies at them via symlinks.
# Merge is content-verified, not exit-code-trusted: every file present in the
# real standalone dir must either be absent in the persistent dir or be
# byte-identical (sha256). A same-named file with different content aborts
# the deploy instead of silently destroying one version.
remote_sh '
  set -e
  link_persist() {
    SRC="$1"; DST="$2"
    mkdir -p "$DST"
    if [ -L "$SRC" ]; then
      if [ "$(readlink "$SRC")" != "$DST" ]; then
        rm -f "$SRC"; ln -s "$DST" "$SRC"
      fi
      echo "  $SRC already linked -> $(readlink "$SRC")"
      return 0
    fi
    if [ -d "$SRC" ]; then
      CONFLICTS=""
      while IFS= read -r -d "" f; do
        rel="${f#$SRC/}"
        if [ -f "$DST/$rel" ]; then
          cmp -s "$f" "$DST/$rel" || CONFLICTS="$CONFLICTS $rel"
        fi
      done < <(find "$SRC" \( -type f -o -type l \) -print0)
      if [ -n "$CONFLICTS" ]; then
        echo "FAIL: same-named files with DIFFERENT content — refusing to lose either:$CONFLICTS" >&2
        exit 1
      fi
      cp -a "$SRC/." "$DST/"
      MISSING=""
      while IFS= read -r -d "" f; do
        rel="${f#$SRC/}"
        [ -e "$DST/$rel" ] || [ -L "$DST/$rel" ] || MISSING="$MISSING $rel"
      done < <(find "$SRC" \( -type f -o -type l \) -print0)
      if [ -n "$MISSING" ]; then
        echo "FAIL: files not present in persistent storage after copy:$MISSING" >&2
        exit 1
      fi
      rm -rf "$SRC"
    fi
    ln -sfn "$DST" "$SRC"
    echo "  $SRC -> $(readlink "$SRC")"
  }
  link_persist "'$DEPLOY_DIR'/.next/standalone/private_uploads" "'$DEPLOY_DIR'/private_uploads"
  link_persist "'$DEPLOY_DIR'/.next/standalone/public/uploads" "'$DEPLOY_DIR'/public/uploads"
'
remote "pm2 restart $PM2_APP --update-env"

if [[ $EXECUTE -eq 1 ]]; then
  for pair in "private_uploads" "public/uploads"; do
    LINK_T=$($SSH "$REMOTE" "readlink $DEPLOY_DIR/.next/standalone/$pair" | tr -d "[:space:]") || \
      fail "cannot read $pair symlink"
    [[ "$LINK_T" == "$DEPLOY_DIR/$pair" ]] || \
      fail "standalone/$pair -> '$LINK_T' != $DEPLOY_DIR/$pair"
  done
  echo "  both upload symlinks verified -> persistent app-root storage"
fi

# ---------------------------------------------------------------------------
step "PHASE F — smoke checks"
# ---------------------------------------------------------------------------
remote "sleep 4; curl -s -o /dev/null -w '%{http_code}' $SITE_URL/login"
remote "curl -s -o /dev/null -w '%{http_code}' $SITE_URL"

echo
if [[ $EXECUTE -eq 1 ]]; then
  echo "Deployment complete — run the release smoke checklist in docs/PRODUCTION_RELEASE_RUNBOOK.md"
else
  echo "DRY RUN complete — no remote commands were executed."
  echo "Review the plan, verify every value in $ENV_FILE, then run: $0 --execute"
fi
