#!/bin/bash
set -e

REMOTE="root@156.67.105.64"
REMOTE_PATH="/var/www/saec-erp"

echo "==> Syncing source files..."
rsync -avz --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'docs' \
  --exclude '.env' \
  --exclude 'ERP-Credentials*' \
  --exclude 'ERP-Fixes*' \
  --exclude 'deploy.sh' \
  -e "ssh -o StrictHostKeyChecking=no" \
  ./ "$REMOTE:$REMOTE_PATH/"

echo "==> Running remote build..."
ssh -o StrictHostKeyChecking=no "$REMOTE" "cd $REMOTE_PATH && \
  npx prisma generate && \
  npx prisma db push --accept-data-loss && \
  npm run build"

echo "==> Copying static files to standalone..."
ssh -o StrictHostKeyChecking=no "$REMOTE" "cd $REMOTE_PATH && \
  cp -r .next/static .next/standalone/.next/static && \
  cp -r public .next/standalone/public 2>/dev/null; \
  chown -R root:root .next/ && \
  chmod -R 755 .next/ && \
  chown root:root $REMOTE_PATH && \
  chmod 755 $REMOTE_PATH"

echo "==> Restarting PM2..."
ssh -o StrictHostKeyChecking=no "$REMOTE" "pm2 restart saec-erp --update-env"

echo "==> Verifying..."
sleep 3
STATUS=$(curl -s -o /dev/null -w '%{http_code}' https://demo.adelphostech.com)
echo "Site status: $STATUS"

CSS_STATUS=$(curl -s -o /dev/null -w '%{http_code}' https://demo.adelphostech.com/_next/static/chunks/1p3zw-bvxcrqw.css 2>/dev/null || echo "N/A")
echo "CSS status: $CSS_STATUS"

echo "==> Deploy complete!"
