#!/bin/bash
set -e

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
ssh -o ConnectTimeout=10 $SERVER " \
  sed -i 's|NEXTAUTH_URL=.*|NEXTAUTH_URL=\"https://demo.adelphostech.com\"|' $REMOTE_DIR/.env && \
  sed -i 's|NEXTAUTH_URL=.*|NEXTAUTH_URL=\"https://demo.adelphostech.com\"|' $REMOTE_DIR/.next/standalone/.env && \
  sed -i 's|DATABASE_URL=.*|DATABASE_URL=\"postgresql://saec_erp:saec_erp@localhost:5432/saec_erp?schema=public\"|' $REMOTE_DIR/.env && \
  sed -i 's|DATABASE_URL=.*|DATABASE_URL=\"postgresql://saec_erp:saec_erp@localhost:5432/saec_erp?schema=public\"|' $REMOTE_DIR/.next/standalone/.env"

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
