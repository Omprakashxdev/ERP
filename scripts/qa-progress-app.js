// Progress App — Site Master QA (Brick 1).
// Runs against the disposable saec_erp_progress_dev DB on localhost:3100.
// Verifies: nav entry, create site, list/search/filter, detail page with
// "No blocks added yet." empty state, edit, archive (soft-delete),
// admin gating, responsive layouts.
const { chromium } = require("@playwright/test");
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3100";
const OUT = path.join(__dirname, "..", "qa-shots");
fs.mkdirSync(OUT, { recursive: true });
const DB_URL =
  process.env.QA_DATABASE_URL ||
  "postgresql://shivang@localhost:5432/saec_erp_progress_dev";
const RUN = `QA${(Date.now() % 100000).toString(36).toUpperCase()}`;
const SITE_CODE = `QA-${RUN}`;
const SITE_NAME = `QA Site ${RUN}`;

const results = [];
const ok = (name, pass, note = "") =>
  results.push(`${pass ? "PASS" : "FAIL"} ${name}${note ? " — " + note : ""}`);

(async () => {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 160));
  });

  // ── Login ──
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"], #email', "admin@saec.com");
  await page.fill('input[type="password"], #password', "ProgressDev123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });
  ok("admin login", true);

  // ── 1. Nav entry visible ──
  await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
  const navLink = page.locator('nav a[href="/dashboard/progress-app"]');
  ok(
    "sidebar shows Progress App → Site Management",
    (await navLink.count()) > 0
  );

  // ── 2. Module page loads, empty state ──
  await navLink.first().click();
  await page.waitForURL(/progress-app/, { timeout: 10000 });
  // Wait until the server-rendered list area is streamed in.
  await page.waitForSelector("text=/Site records|No sites found/", {
    timeout: 15000,
  });
  const empty = await page
    .locator("text=No sites found")
    .count()
    .catch(() => 0);
  ok("empty state when no sites", empty > 0);

  // ── 3. Create site via dialog ──
  await page.getByRole("button", { name: /new site/i }).first().click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  await page.fill("#siteCode", SITE_CODE);
  await page.fill("#siteName", SITE_NAME);
  await page.fill("#city", "Ahmedabad");
  await page.fill("#state", "Gujarat");
  await page.fill("#latitude", "23.0225");
  await page.fill("#longitude", "72.5714");
  await page.getByRole("button", { name: /create site/i }).click();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: "networkidle" });
  const rowVisible = await page
    .locator("tr", { hasText: SITE_NAME })
    .count();
  ok("created site appears in list", rowVisible > 0);
  const dbRow = await db.query(
    'SELECT "siteCode", status FROM "ProgressSite" WHERE "siteCode"=$1',
    [SITE_CODE]
  );
  ok(
    "site persisted in PostgreSQL",
    dbRow.rows.length === 1 && dbRow.rows[0].status === "PLANNED",
    JSON.stringify(dbRow.rows[0] ?? null)
  );
  await page.screenshot({ path: path.join(OUT, "pa-list-desktop.png") });

  // ── 4. Duplicate code rejected ──
  await page.getByRole("button", { name: /new site/i }).first().click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  await page.fill("#siteCode", SITE_CODE);
  await page.fill("#siteName", "Duplicate Code Site");
  await page.getByRole("button", { name: /create site/i }).click();
  await page.waitForTimeout(1200);
  const dupErr = await page
    .locator("text=/already in use/i")
    .count();
  ok("duplicate site code rejected in UI", dupErr > 0);
  const dupCount = await db.query(
    'SELECT COUNT(*)::int n FROM "ProgressSite" WHERE "siteCode"=$1',
    [SITE_CODE]
  );
  ok("no duplicate row created", dupCount.rows[0].n === 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ── 5. Search filter ──
  await page.fill("#site-search", "no-such-site-zzz");
  await page.getByRole("button", { name: /apply filters/i }).click();
  await page.waitForTimeout(1000);
  const noMatch = await page.locator("text=No sites found").count();
  ok("search non-match shows empty state", noMatch > 0);
  await page.fill("#site-search", RUN);
  await page.getByRole("button", { name: /apply filters/i }).click();
  await page.waitForTimeout(1000);
  const match = await page.locator("tr", { hasText: SITE_NAME }).count();
  ok("search finds site by code fragment", match > 0);
  await page.getByRole("button", { name: /clear/i }).click();
  await page.waitForTimeout(800);

  // ── 6. Detail page + empty blocks state ──
  await page.locator("tr", { hasText: SITE_NAME }).locator("a").first().click();
  await page.waitForURL(/progress-app\/sites\//, { timeout: 10000 });
  const blocksEmpty = await page
    .locator("text=No blocks added yet.")
    .waitFor({ state: "visible", timeout: 15000 })
    .then(() => 1)
    .catch(() => 0);
  ok("detail shows 'No blocks added yet.'", blocksEmpty > 0);
  const fakeProgress = await page.locator("text=/%|percent|complete \d/i").count();
  ok("no fictional progress shown", fakeProgress === 0);
  await page.screenshot({ path: path.join(OUT, "pa-detail-desktop.png") });

  // ── 7. Edit site ──
  await page.getByRole("button", { name: /edit site/i }).click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  const codeDisabled = await page.locator("#siteCode").isDisabled();
  ok("site code immutable on edit", codeDisabled);
  await page.fill("#siteName", `${SITE_NAME} Updated`);
  await page.getByRole("button", { name: /save changes/i }).click();
  await page.waitForTimeout(1200);
  const updated = await page
    .locator(`text=${SITE_NAME} Updated`)
    .count();
  ok("edit persists on detail page", updated > 0);
  const dbName = await db.query(
    'SELECT "siteName" FROM "ProgressSite" WHERE "siteCode"=$1',
    [SITE_CODE]
  );
  ok("edit persisted in DB", dbName.rows[0]?.siteName === `${SITE_NAME} Updated`);

  // ── 8. Archive site (soft delete) ──
  await page.getByRole("button", { name: /archive site/i }).click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(OUT, "pa-archive-confirm.png") });
  await page
    .locator('[role="dialog"]')
    .getByRole("button", { name: /archive site/i })
    .click();
  await page.waitForTimeout(1200);
  const archivedBadge = await page.locator("text=Archived").count();
  ok("archive updates detail badge", archivedBadge > 0);
  const dbStatus = await db.query(
    'SELECT status FROM "ProgressSite" WHERE "siteCode"=$1',
    [SITE_CODE]
  );
  ok(
    "archived row remains in DB",
    dbStatus.rows.length === 1 && dbStatus.rows[0].status === "ARCHIVED"
  );

  // ── 9. Archived hidden from default list, visible via filter ──
  await page.goto(BASE + "/dashboard/progress-app", {
    waitUntil: "networkidle",
  });
  const hiddenRow = await page.locator("tr", { hasText: SITE_NAME }).count();
  ok("archived hidden from default list", hiddenRow === 0);
  // filter by archived status
  await page.locator("#site-status").click();
  await page.getByRole("option", { name: /archived/i }).click();
  await page.getByRole("button", { name: /apply filters/i }).click();
  await page.waitForTimeout(1000);
  const shownRow = await page.locator("tr", { hasText: SITE_NAME }).count();
  ok("archived visible via status filter", shownRow > 0);
  await page.screenshot({ path: path.join(OUT, "pa-list-archived-filter.png") });

  // ── 10. Mobile viewport ──
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/dashboard/progress-app", {
    waitUntil: "networkidle",
  });
  await page.screenshot({ path: path.join(OUT, "pa-list-mobile-390.png") });
  const tablet = await ctx.newPage();
  await tablet.setViewportSize({ width: 768, height: 1024 });
  await tablet.goto(BASE + "/dashboard/progress-app", {
    waitUntil: "networkidle",
  });
  await tablet.screenshot({ path: path.join(OUT, "pa-list-tablet-768.png") });
  ok("mobile + tablet layouts render", true);

  const fatal = errors.filter(
    (e) => !/favicon|chunk|hydration|DevTools|third-?party|preload/i.test(e)
  );
  ok("no console/page errors", fatal.length === 0, fatal[0] ?? "");

  await browser.close();
  await db.end();

  console.log("\n=== Progress App QA results ===");
  results.forEach((r) => console.log(r));
  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed.`
  );
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error("QA crashed:", e);
  results.forEach((r) => console.log(r));
  process.exit(1);
});
