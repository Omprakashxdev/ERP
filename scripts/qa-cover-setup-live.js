// Live Progress App release QA — cover upload + guided setup workflow.
// Runs against PRODUCTION with the dedicated QA admin + QA-LIVE site.
// Screenshots land in qa-shots/live-rel2/.
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = "https://erp.adelphostech.com";
const OUT = path.join(__dirname, "..", "qa-shots", "live-rel2");
fs.mkdirSync(OUT, { recursive: true });

const shot = (page, name) =>
  page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: true });

const results = [];
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);

// tiny valid PNG used as the cover upload
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAD0lEQVR42mNk+M9QzwAEAAoBAf5/tXNPAAAAAElFTkSuQmCC",
  "base64"
);
const COVER_FILE = path.join(OUT, "cover-upload.png");
fs.writeFileSync(COVER_FILE, PNG);

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    ignoreHTTPSErrors: false,
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 160)));

  // ── login ──
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"], input[name="email"], #email', "qa-admin@saec-qa.local");
  await page.fill('input[type="password"], input[name="password"], #password', process.env.QA_ADMIN_PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  check("admin login lands on dashboard", page.url().includes("/dashboard"));

  // ── sites table ──
  await page.goto(BASE + "/dashboard/progress-app", { waitUntil: "networkidle" });
  const manageBtns = await page.locator('a[title="Manage Site Structure"], button[title="Manage Site Structure"]').count();
  check("sites table shows Manage Site Structure action", manageBtns >= 1, `${manageBtns} rows`);
  const newSiteBtn = page.locator('button:has-text("New Site"), button:has-text("Add Site")').first();
  check("New Site button visible", await newSiteBtn.isVisible().catch(() => false));
  await shot(page, "01-sites-table");

  // ── new site form has cover control ──
  await newSiteBtn.click();
  await page.waitForSelector("text=Site cover image", { timeout: 5000 });
  check("Add Site form shows Site cover image field", true);
  check(
    "cover accepts jpeg/png/webp",
    (await page.locator('input[type="file"][accept*="webp"]').count()) === 1
  );
  await shot(page, "02-new-site-form");
  await page.keyboard.press("Escape");
  await page.locator('button:has-text("Cancel")').first().click().catch(() => {});

  // ── QA-LIVE detail page ──
  await page.goto(BASE + "/dashboard/progress-app", { waitUntil: "networkidle" });
  await page.click('a:has-text("QA Live Test Site"), a:has-text("QA-LIVE")');
  // server page streams skeletons first — wait for real content
  await page.waitForSelector('h1:has-text("QA")', { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
  const url = page.url();
  check("site detail page reached", /sites\//.test(url), url);

  check(
    "guided setup card visible",
    await page.locator("text=Site setup").first().isVisible().catch(() => false)
  );
  check(
    "setup shows 7 steps configured count",
    await page.locator('text=/of 7 configured/').first().isVisible().catch(() => false)
  );
  for (const label of ["Wings / Blocks", "Floors", "Flats and flat numbers", "Rooms", "Room activity checklists", "Employee assignments"]) {
    check(
      `setup step row: ${label}`,
      await page.locator(`text=${label}`).first().isVisible().catch(() => false)
    );
  }
  check(
    "Manage Site Structure button on detail",
    await page.locator('a:has-text("Manage Site Structure")').first().isVisible().catch(() => false)
  );
  await shot(page, "03-site-detail-setup");

  // ── edit site → upload cover ──
  const editBtn = page.locator('button:has-text("Edit")').first();
  await editBtn.click();
  await page.waitForSelector("text=Site cover image", { timeout: 5000 });
  await page.locator('input[type="file"][accept*="webp"]').setInputFiles(COVER_FILE);
  await page.waitForTimeout(600);
  check("cover preview appears after pick", await page.locator('img[alt="New cover preview"]').isVisible().catch(() => false));
  await shot(page, "04-edit-cover-preview");
  await page.click('button[type="submit"]:has-text("Save")');
  await page.waitForTimeout(2500);
  await page.waitForLoadState("networkidle").catch(() => {});

  // cover thumb in detail header after save
  const headerImg = page.locator(`img[alt*="cover"]`).first();
  check("site detail header shows saved cover", await headerImg.isVisible().catch(() => false));
  await shot(page, "05-detail-with-cover");

  // ── table thumb ──
  await page.goto(BASE + "/dashboard/progress-app", { waitUntil: "networkidle" });
  const thumb = page.locator('img[src*="/api/site-covers/"]').first();
  check("sites table row shows cover thumb", await thumb.isVisible().catch(() => false));
  await shot(page, "06-table-thumb");

  // ── hierarchy manage screens ──
  await page.click('a:has-text("QA Live Test Site"), a:has-text("QA-LIVE")');
  await page.waitForLoadState("networkidle");
  const wingLink = page.locator('a[href*="/wings/"]').first();
  if (await wingLink.isVisible().catch(() => false)) {
    await wingLink.click();
    await page.waitForSelector("text=Floor", { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    check("wing page reachable", /wings\//.test(page.url()), page.url());
    check("Add Floor control visible", await page.locator('button:has-text("Floor"), a:has-text("Floor")').first().isVisible().catch(() => false));
    await shot(page, "07-wing-floors");
  }
  await shot(page, "99-final");

  console.log("\n=== LIVE QA RESULTS ===");
  for (const r of results) console.log(r);
  console.log(`\nconsole errors: ${consoleErrors.length}`);
  consoleErrors.slice(0, 5).forEach((e) => console.log("  " + e));
  await browser.close();
  process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
})();
