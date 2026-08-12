---
description: Deploy the ERP application to production server
---

## Deploy to Production

Run the deployment script from the project root:

```bash
// turbo
./scripts/deploy.sh
```

This script:
1. Rsyncs code to `/var/www/saec-erp` on `156.67.105.64` (excludes `.env`, `node_modules`, `.next`, `.git`)
2. Runs `npm install` and `npx prisma generate` on the server
3. Runs `npx prisma db push` to sync schema
4. Builds Next.js (`npx next build`)
5. Copies `.env` and static files to `.next/standalone/`
6. Fixes directory permissions (chmod 755 for nginx access)
7. Restarts PM2 process `saec-erp`
8. Verifies the site and CSS are loading

**Important:** The server's `.env` is NOT overwritten by rsync (it's excluded). The server has its own `.env` with:
- `DATABASE_URL="postgresql://saec_erp:saec_erp@localhost:5432/saec_erp?schema=public"`
- `NEXTAUTH_URL="https://demo.adelphostech.com"`

The local `.env` has:
- `DATABASE_URL="postgresql://shivang@localhost:5432/saec_erp?schema=public"`
- `NEXTAUTH_URL="http://localhost:3000"`

Both are kept separate permanently.
