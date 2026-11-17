#!/bin/bash
set -e

# DEMO-ONLY deploy script — targets the OLD/demo host, NOT live production
# (live = erp.adelphostech.com / 45.113.226.115). For production use
# scripts/deploy-production.sh which is fail-closed and uses
# `prisma migrate deploy`. Running this script requires CONFIRM_DEMO=yes.
if [[ "${CONFIRM_DEMO:-}" != "yes" ]]; then
  echo "This is the DEMO deploy script (root@156.67.105.64)."
  echo "It is NOT for production. To deploy the demo deliberately:"
  echo "  CONFIRM_DEMO=yes ./scripts/deploy.sh"
  echo "For production, use: scripts/deploy-production.sh"
  exit 1
fi

SERVER="root@156.67.105.64"
REMOTE_DIR="/var/www/saec-erp"
APP_NAME="saec-erp"

echo "=== ERP Deployment Script ==="
echo "1. Syncing code (excluding .env, node_modules, .next, .git)..."
rsync -avz --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='scripts/' \
  --exclude='private_uploads/' \
  --exclude='public/uploads/' \
  -e "ssh -o ConnectTimeout=10" \
  ./ "$SERVER:$REMOTE_DIR/"

echo "2. Installing dependencies & generating Prisma client..."
ssh -o ConnectTimeout=10 $SERVER "cd $REMOTE_DIR && npm install 2>&1 | tail -3 && npx prisma generate 2>&1 | tail -3"

echo "3. Pushing schema to database..."
ssh -o ConnectTimeout=10 $SERVER "cd $REMOTE_DIR && npx prisma db push 2>&1 | tail -5"

echo "4. Building Next.js..."
ssh -o ConnectTimeout=30 $SERVER "cd $REMOTE_DIR && rm -rf .next && npx next build 2>&1 | tail -10"

echo "5. Copying .env and static files to standalone..."
ssh -o ConnectTimeout=10 $SERVER "cd $REMOTE_DIR && \
  cp .env .next/standalone/.env && \
  cp -r public .next/standalone/public && \
  cp -r .next/static .next/standalone/.next/static"

echo "5b. Ensuring production NEXTAUTH_URL in both .env files..."
# Database credentials are NEVER embedded in this script. If the demo .env
# needs its DATABASE_URL rewritten, supply it explicitly via DEMO_DATABASE_URL
# in your environment — otherwise the server-side .env is left untouched.
ssh -o ConnectTimeout=10 $SERVER " \
  sed -i 's|NEXTAUTH_URL=.*|NEXTAUTH_URL=\"https://demo.adelphostech.com\"|' $REMOTE_DIR/.env && \
  sed -i 's|NEXTAUTH_URL=.*|NEXTAUTH_URL=\"https://demo.adelphostech.com\"|' $REMOTE_DIR/.next/standalone/.env"
if [[ -n "${DEMO_DATABASE_URL:-}" ]]; then
  echo "5c. Applying DEMO_DATABASE_URL from environment (not shown)..."
  ssh -o ConnectTimeout=10 $SERVER " \
    sed -i 's|DATABASE_URL=.*|DATABASE_URL=\"${DEMO_DATABASE_URL}\"|' $REMOTE_DIR/.env && \
    sed -i 's|DATABASE_URL=.*|DATABASE_URL=\"${DEMO_DATABASE_URL}\"|' $REMOTE_DIR/.next/standalone/.env"
else
  echo "5c. DEMO_DATABASE_URL not set — leaving remote DATABASE_URL unchanged."
fi

echo "6. Fixing permissions..."
ssh -o ConnectTimeout=10 $SERVER "chmod 755 $REMOTE_DIR && chmod -R a+rX $REMOTE_DIR/.next/static/"

echo "7. Restarting PM2..."
ssh -o ConnectTimeout=10 $SERVER "pm2 restart $APP_NAME --update-env 2>&1 | tail -5"

echo "8. Verifying..."
sleep 3
REDIRECT=$(curl -s -o /dev/null -w "%{redirect_url}" https://demo.adelphostech.com/)
echo "Site redirect: $REDIRECT"
if echo "$REDIRECT" | grep -q "localhost"; then
  echo "ERROR: Redirect still points to localhost! NEXTAUTH_URL not fixed."
  exit 1
fi
echo "Site status: OK (redirects to production login)"

CSS_FILE=$(ssh -o ConnectTimeout=10 $SERVER "find $REMOTE_DIR/.next/static -name '*.css' | head -1")
CSS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://demo.adelphostech.com/_next/static/chunks/$(basename $CSS_FILE)")
echo "CSS status: $CSS_CODE (200 = OK)"

echo "=== Deployment complete! ==="
