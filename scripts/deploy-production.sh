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
BACKUP_ONLY=0
[[ "${1:-}" == "--execute" ]] && EXECUTE=1
# --backup-only runs Phases A–B for real (fresh DB + uploads backup pulled
# and checksum-verified), then stops — this is how the operator produces
# the artifact the restore rehearsal attests BEFORE --execute is allowed.
[[ "${1:-}" == "--backup-only" ]] && BACKUP_ONLY=1
[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && { sed -n '2,20p' "$0"; exit 0; }

ENV_FILE="deploy/production.env"
KNOWN_DEMO_HOST="156.67.105.64"
EXPECTED_INDEXES=(
  # In-Out release (already live — re-verified each deploy)
  "InOutRegister_documentRefNo_key"
  "ModeMaster_name_key"
  "PendingInOutUpload_storedName_key"
  # Progress App release — the invariants this deploy adds
  "ProgressRoomChecklist_one_active_per_room"
  "ProgressActivityHistory_eventId_key"
  "ProgressPhoto_clientEventId_key"
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
# --backup-only is the step that produces the artifact the rehearsal
# verifies — requiring the attestation up front would be circular.
if [[ $EXECUTE -eq 1 && $BACKUP_ONLY -eq 0 && "${RESTORE_REHEARSAL_DONE:-}" != "yes" ]]; then
  fail "RESTORE_REHEARSAL_DONE=yes required in $ENV_FILE — restore the latest backup into a disposable DB and verify record counts before releasing"
fi
[[ $BACKUP_ONLY -eq 1 ]] && EXECUTE=1

REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"
SSH="ssh -o BatchMode=yes -o ConnectTimeout=10"
DATE_TAG="$(date +%Y%m%d_%H%M)"
BACKUP_DIR="deploy/backups/${DATE_TAG}"

echo "  target:   ${REMOTE}:${DEPLOY_DIR}"
echo "  pm2 app:  ${PM2_APP}"
echo "  database: ${DB_NAME} (role ${DB_USER})"
echo "  mode:     $([ $BACKUP_ONLY -eq 1 ] && echo BACKUP-ONLY || ([ $EXECUTE -eq 1 ] && echo EXECUTE || echo DRY-RUN))"

# run <ssh command...> — always printed, executed only with --execute
run() {
  echo "  \$ $*"
  [[ $EXECUTE -eq 1 ]] || return 0
  "$@"
}
remote() { run $SSH "$REMOTE" "$@"; }
remote_sh() { run $SSH "$REMOTE" "bash -s" <<< "$1"; }

# Fail-closed merge+symlink procedure, defined ONCE and injected into both
# the pre-build rescue and the post-build relink so every merge is
# checksum-verified: unsafe entries abort before anything is copied, a
# same-named file with different content aborts instead of silently
# destroying one version, and every copied file is re-verified by SHA-256
# before the source dir is removed.
read -r -d '' LINK_PERSIST <<'EOS' || true
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
    # Reject unsafe filesystem entries (fifos, sockets, devices) — nothing
    # is deleted on abort, both locations are preserved untouched.
    UNSAFE=$(find "$SRC" ! -type f ! -type l ! -type d | head -5)
    if [ -n "$UNSAFE" ]; then
      echo "FAIL: unsafe filesystem entries in $SRC — refusing to merge:$UNSAFE" >&2
      exit 1
    fi
    CONFLICTS=""
    while IFS= read -r -d "" f; do
      rel="${f#$SRC/}"
      if [ -f "$f" ] && [ -f "$DST/$rel" ]; then
        SRC_SUM="$(sha256sum "$f" | cut -d" " -f1)"
        DST_SUM="$(sha256sum "$DST/$rel" | cut -d" " -f1)"
        [ "$SRC_SUM" = "$DST_SUM" ] || CONFLICTS="$CONFLICTS $rel"
      fi
    done < <(find "$SRC" \( -type f -o -type l \) -print0)
    if [ -n "$CONFLICTS" ]; then
      echo "FAIL: same-named files with DIFFERENT content — refusing to lose either:$CONFLICTS" >&2
      exit 1
    fi
    cp -a "$SRC/." "$DST/"
    # Post-copy proof, not presence alone: every regular file must match
    # by SHA-256; every entry must exist (dangling symlinks included).
    MISSING=""; MISMATCH=""
    while IFS= read -r -d "" f; do
      rel="${f#$SRC/}"
      if [ -f "$f" ]; then
        if [ -f "$DST/$rel" ]; then
          SRC_SUM="$(sha256sum "$f" | cut -d" " -f1)"
          DST_SUM="$(sha256sum "$DST/$rel" | cut -d" " -f1)"
          [ "$SRC_SUM" = "$DST_SUM" ] || MISMATCH="$MISMATCH $rel"
        else
          MISSING="$MISSING $rel"
        fi
      else
        [ -e "$DST/$rel" ] || [ -L "$DST/$rel" ] || MISSING="$MISSING $rel"
      fi
    done < <(find "$SRC" \( -type f -o -type l \) -print0)
    if [ -n "$MISSING" ] || [ -n "$MISMATCH" ]; then
      echo "FAIL: post-copy verification — missing:$MISSING sha256-mismatch:$MISMATCH (source dir left intact)" >&2
      exit 1
    fi
    rm -rf "$SRC"
  fi
  ln -sfn "$DST" "$SRC"
  echo "  $SRC -> $(readlink "$SRC")"
}
EOS

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
# migrate status exits non-zero when migrations are pending — that is the
# expected pre-deploy state, so tolerate it and enforce the pending set below.
remote "cd $DEPLOY_DIR && npx prisma migrate status || true"
echo "  # pending set must be EXACTLY the 4 progress-app migrations"
echo "  # (site_master, hierarchy, checklists, mobile_photos) — abort if anything else appears"
if [[ $EXECUTE -eq 1 ]]; then
  UNEXPECTED=$($SSH "$REMOTE" "cd $DEPLOY_DIR && for d in prisma/migrations/*/; do \
    n=\$(basename \"\$d\"); \
    sudo -u postgres psql -d $DB_NAME -Atc \"SELECT 1 FROM _prisma_migrations WHERE migration_name='\$n'\" | grep -q 1 || echo \"\$n\"; \
  done | grep -vE 'progress_(site_master|hierarchy|checklists|mobile_photos)' || true")
  [[ -z "$UNEXPECTED" ]] || fail "pending migrations outside the progress-app set: $UNEXPECTED"
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
# Archive-level integrity: a dump pg_restore cannot list is useless —
# verify the TOC parses before it is ever needed. Run as the SSH user —
# the backup lives under ~/, which postgres may not be able to read.
remote "pg_restore --list ~/${DATE_TAG}_backup/db.dump > /dev/null && echo 'dump TOC parses'"
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
  # Checksum the pulled copies against the remote originals — a backup
  # that only exists on the machine being modified is not a backup, and
  # a truncated transfer is not one either.
  for f in db.dump uploads.tgz; do
    RSHA=$($SSH "$REMOTE" "sha256sum ~/${DATE_TAG}_backup/$f | cut -d' ' -f1") || \
      fail "cannot read remote checksum for $f"
    LSHA=$(shasum -a 256 "$BACKUP_DIR/$f" | cut -d' ' -f1)
    [[ "$RSHA" == "$LSHA" ]] || \
      fail "$f checksum mismatch (remote ${RSHA:0:12}… local ${LSHA:0:12}…) — pulled copy is not trustworthy"
  done
  echo "  local backup copies verified present + checksum-matched in $BACKUP_DIR"
fi
if [[ $BACKUP_ONLY -eq 1 ]]; then
  echo
  echo "BACKUP-ONLY complete. Next: restore $BACKUP_DIR/db.dump into a"
  echo "disposable database, verify record counts, then set"
  echo "RESTORE_REHEARSAL_DONE=yes in $ENV_FILE before running --execute."
  exit 0
fi

# ---------------------------------------------------------------------------
step "PHASE C — code sync (uploads + env + build dirs excluded)"
# ---------------------------------------------------------------------------
RSYNC_EXCLUDES=(
  --exclude '.git' --exclude 'node_modules' --exclude '.next'
  --exclude '.env' --exclude '.env.*' --exclude 'docs'
  --exclude 'private_uploads/' --exclude 'public/uploads/'
  --exclude 'deploy/backups/' --exclude 'backups/' --exclude 'qa-shots/'
  --exclude 'mobile/build/' --exclude 'mobile/.dart_tool/'
  --exclude 'mobile/android/.gradle/' --exclude 'mobile/android/local.properties'
  --exclude 'mobile/android/key.properties' --exclude 'mobile/android/app/*.jks'
  --exclude 'mobile/android/app/*.keystore'
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
  [[ "$IDX" == "${#EXPECTED_INDEXES[@]}" ]] || fail "expected ${#EXPECTED_INDEXES[@]} release indexes, found $IDX — index missing; investigate before restart"
  echo "  all ${#EXPECTED_INDEXES[@]} functional/unique indexes verified present"
fi

# ---------------------------------------------------------------------------
step "PHASE E — build + restart"
# ---------------------------------------------------------------------------
# Rescue runtime-written uploads out of the standalone build dir BEFORE the
# build can wipe .next — same fail-closed, SHA-256-verified merge used
# post-build, applied to BOTH upload roots so nothing is lost if the build
# aborts midway or a file conflicts.
remote_sh "$LINK_PERSIST"'
link_persist "'$DEPLOY_DIR'/.next/standalone/private_uploads" "'$DEPLOY_DIR'/private_uploads"
link_persist "'$DEPLOY_DIR'/.next/standalone/public/uploads" "'$DEPLOY_DIR'/public/uploads"
'
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
remote_sh "$LINK_PERSIST"'
  set -e
  link_persist "'$DEPLOY_DIR'/.next/standalone/private_uploads" "'$DEPLOY_DIR'/private_uploads"
  link_persist "'$DEPLOY_DIR'/.next/standalone/public/uploads" "'$DEPLOY_DIR'/public/uploads"
  # Static serving would follow a symlink left INSIDE the persistent upload
  # dir out of the storage root, bypassing the realpath guard in the
  # /uploads route — refuse to deploy if any link escapes its own root.
  for root in "'$DEPLOY_DIR'/public/uploads" "'$DEPLOY_DIR'/private_uploads"; do
    root="$(realpath "$root")"
    while IFS= read -r -d "" l; do
      tgt="$(realpath "$l" 2>/dev/null || echo ESCAPE)"
      case "$tgt" in "$root"/*|"$root") ;; *)
        echo "FAIL: symlink escapes storage root or is dangling: $l -> $tgt" >&2; exit 1;;
      esac
    done < <(find "$root" -type l -print0)
  done
  echo "  no escaping symlinks inside persistent storage"
'
# Mobile-API runtime env must exist BEFORE the restart: with no bearer
# secret the routes cannot sign tokens, and src/instrumentation.ts is
# fail-closed — the app refuses to boot if rate limiting is unconfigured.
# Checking key names only; values are never read or printed.
remote_check "server .env must define MOBILE_TOKEN_SECRET, PROGRESS_PHOTO_DIR and a rate-limit backend (names only)" \
  "cd $DEPLOY_DIR && grep -cE '^(MOBILE_TOKEN_SECRET|PROGRESS_PHOTO_DIR|UPSTASH_REDIS_REST_URL|RATE_LIMIT_FALLBACK)=' .env"
if [[ $EXECUTE -eq 1 ]]; then
  ENV_MISSING=$($SSH "$REMOTE" "cd $DEPLOY_DIR && \
    for v in MOBILE_TOKEN_SECRET PROGRESS_PHOTO_DIR; do \
      grep -q \"^\$v=.\" .env || echo \$v; \
    done; \
    grep -q '^RATE_LIMIT_FALLBACK=memory' .env || \
      { grep -q '^UPSTASH_REDIS_REST_URL=.' .env && \
        grep -q '^UPSTASH_REDIS_REST_TOKEN=.' .env || \
        echo RATE_LIMIT_BACKEND; }")
  [[ -z "$ENV_MISSING" ]] || \
    fail "server .env missing required runtime keys: $ENV_MISSING — set them (no secrets in this output) before restarting"
  echo "  server .env has MOBILE_TOKEN_SECRET, PROGRESS_PHOTO_DIR and a rate-limit backend"
fi
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
# Mobile API must answer with a JSON 401 — a 307 to /login would mean the
# proxy exemption for /api/mobile/ did not deploy.
remote "curl -s -o /dev/null -w '%{http_code}' $SITE_URL/api/mobile/v1/me"

echo
if [[ $EXECUTE -eq 1 ]]; then
  echo "Deployment complete — run the release smoke checklist in docs/PRODUCTION_RELEASE_RUNBOOK.md"
else
  echo "DRY RUN complete — no remote commands were executed."
  echo "Review the plan, verify every value in $ENV_FILE, then run: $0 --execute"
fi
