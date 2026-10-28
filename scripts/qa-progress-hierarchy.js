// Progress App — Hierarchy QA (Brick 2).
// Runs against the disposable saec_erp_progress_dev DB on localhost:3100.
// Verifies: multi-wing site, per-wing floors, flats, rooms, same-parent
// duplicate rejection, parent deactivation preserving descendants,
// breadcrumbs, read-only staff access, responsive layouts.
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
const RUN = `H${(Date.now() % 100000).toString(36).toUpperCase()}`;
const SITE_CODE = `HQA-${RUN}`;
const SITE_NAME = `Hierarchy QA ${RUN}`;

const results = [];
const ok = (name, pass, note = "") =>
  results.push(`${pass ? "PASS" : "FAIL"} ${name}${note ? " — " + note : ""}`);

async function addChild(page, kind, fields) {
  const dialog = page.locator('[role="dialog"]');
  const trigger = page
    .getByRole("button", { name: new RegExp(`add ${kind}`, "i") })
    .first();
  await trigger.click();
  // A click that lands before hydration finishes is a no-op — retry once.
  const opened = await dialog
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!opened) {
    await trigger.click();
    await dialog.waitFor({ state: "visible" });
  }
  for (const [id, value] of Object.entries(fields)) {
    await page.fill(`#hc-${id}`, value);
  }
  await dialog
    .getByRole("button", { name: new RegExp(`add ${kind}`, "i") })
    .click();
  await page.waitForTimeout(1000);
}

async function login(page, email, password) {
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"], #email', email);
  await page.fill('input[type="password"], #password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });
}

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

  // ── Login + create a site ──
  await login(page, "admin@saec.com", "ProgressDev123!");
  ok("admin login", true);

  await page.goto(BASE + "/dashboard/progress-app", {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: /new site/i }).first().click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  await page.fill("#siteCode", SITE_CODE);
  await page.fill("#siteName", SITE_NAME);
  await page.fill("#city", "Ahmedabad");
  await page.getByRole("button", { name: /create site/i }).click();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: "networkidle" });
  const siteRow = page.locator("tr", { hasText: SITE_NAME });
  ok("QA site created", (await siteRow.count()) > 0);

  await siteRow.locator("a").first().click();
  await page.waitForURL(/progress-app\/sites\//, { timeout: 10000 });
  const siteUrl = page.url();
  const siteId = siteUrl.split("/sites/")[1].replace(/\/$/, "");

  // ── 1. Empty wings state ──
  const wingsEmpty = await page
    .locator("text=No blocks added yet.")
    .waitFor({ state: "visible", timeout: 15000 })
    .then(() => 1)
    .catch(() => 0);
  ok("site detail shows 'No blocks added yet.'", wingsEmpty > 0);
  await page.screenshot({ path: path.join(OUT, "ph-site-empty.png") });

  // ── 2. Add two wings ──
  await addChild(page, "wing", { code: "W-A", name: "Wing Alpha" });
  await addChild(page, "wing", {
    code: "W-B",
    name: "Wing Beta",
    displayOrder: "2",
  });
  await page.reload({ waitUntil: "networkidle" });
  ok(
    "two wings listed on site detail",
    (await page.locator("tr", { hasText: "Wing Alpha" }).count()) > 0 &&
      (await page.locator("tr", { hasText: "Wing Beta" }).count()) > 0
  );

  // ── 3. Duplicate wing code rejected ──
  await addChild(page, "wing", { code: "w-a", name: "Dup Wing" });
  const dupWing = await page
    .locator('[role="dialog"]').locator('text=/already exists/i')
    .count();
  ok("duplicate wing code rejected in UI", dupWing > 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const wingCount = await db.query(
    'SELECT COUNT(*)::int n FROM "ProgressWing" WHERE "siteId"=$1',
    [siteId]
  );
  ok("only 2 wing rows in DB", wingCount.rows[0].n === 2);
  await page.screenshot({ path: path.join(OUT, "ph-site-populated.png") });

  // ── 4. Navigate to Wing Alpha ──
  const wingAlphaRow = page.locator("tr", { hasText: "Wing Alpha" });
  await wingAlphaRow.locator("a").first().click();
  await page.waitForURL(/progress-app\/wings\//, { timeout: 10000 });
  const wingAUrl = page.url();
  const wingAId = wingAUrl.split("/wings/")[1].replace(/\/$/, "");
  ok("navigated to wing detail", /wings\//.test(wingAUrl));
  const crumbs = await page
    .locator("nav a", { hasText: /Progress App|Hierarchy QA/ })
    .count();
  ok("breadcrumb shows Progress App → Site", crumbs >= 2);
  await page.waitForSelector("text=No floors added yet.", { timeout: 15000 });
  ok("wing detail shows empty floors", true);

  // ── 5. Add floors G, 1, 2 under Wing Alpha ──
  await addChild(page, "floor", {
    floorIdentifier: "G",
    displayName: "Ground Floor",
  });
  await addChild(page, "floor", {
    floorIdentifier: "1",
    displayName: "First Floor",
    displayOrder: "1",
  });
  await addChild(page, "floor", { floorIdentifier: "2", displayOrder: "2" });
  await page.reload({ waitUntil: "networkidle" });
  const floorRows = await page.locator("tbody tr").count();
  ok("3 floors listed under Wing Alpha", floorRows >= 3, `rows=${floorRows}`);

  // ── 6. Duplicate floor rejected ──
  await addChild(page, "floor", { floorIdentifier: "g" });
  const dupFloor = await page
    .locator('[role="dialog"]').locator('text=/already exists/i')
    .count();
  ok("duplicate floor identifier rejected", dupFloor > 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "ph-wing-desktop.png") });

  // ── 7. Wing Beta gets a different structure (floor B1) ──
  const wingBRow = await db.query(
    'SELECT id FROM "ProgressWing" WHERE "siteId"=$1 AND code=$2',
    [siteId, "W-B"]
  );
  const wingBId = wingBRow.rows[0].id;
  await page.goto(`${BASE}/dashboard/progress-app/wings/${wingBId}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("text=No floors added yet.", { timeout: 15000 });
  await addChild(page, "floor", {
    floorIdentifier: "B1",
    displayName: "Basement 1",
  });
  await page.reload({ waitUntil: "networkidle" });
  const bFloors = await db.query(
    'SELECT COUNT(*)::int n FROM "ProgressFloor" WHERE "wingId"=$1',
    [wingBId]
  );
  ok(
    "wing B has its own floor structure",
    bFloors.rows[0].n === 1,
    `n=${bFloors.rows[0].n}`
  );
  // same identifier 'G' allowed under a different wing
  await addChild(page, "floor", { floorIdentifier: "G" });
  const bFloors2 = await db.query(
    'SELECT COUNT(*)::int n FROM "ProgressFloor" WHERE "wingId"=$1',
    [wingBId]
  );
  ok(
    "same floor identifier allowed under different wing",
    bFloors2.rows[0].n === 2
  );

  // ── 8. Floor detail → flats ──
  const floor1 = await db.query(
    'SELECT id FROM "ProgressFloor" WHERE "wingId"=$1 AND "floorIdentifier"=$2',
    [wingAId, "1"]
  );
  const floor1Id = floor1.rows[0].id;
  await page.goto(`${BASE}/dashboard/progress-app/floors/${floor1Id}`, {
    waitUntil: "networkidle",
  });
  const crumbNav = await page.locator("nav a").allTextContents();
  ok(
    "floor breadcrumb: App → Site → Wing",
    crumbNav.some((t) => /Progress App/.test(t)) &&
      crumbNav.some((t) => new RegExp(SITE_NAME.slice(0, 12)).test(t)) &&
      crumbNav.some((t) => /Wing W-A/.test(t)),
    crumbNav.join(" | ")
  );
  await page.waitForSelector("text=No flats added yet.", { timeout: 15000 });
  await addChild(page, "flat", {
    flatNumber: "101",
    flatType: "2BHK",
    displayOrder: "1",
  });
  await addChild(page, "flat", {
    flatNumber: "102",
    flatType: "3BHK",
    displayOrder: "2",
  });
  await page.reload({ waitUntil: "networkidle" });
  ok(
    "2 flats listed on floor 1",
    (await page.locator("tr", { hasText: "101" }).count()) > 0 &&
      (await page.locator("tr", { hasText: "102" }).count()) > 0
  );
  await addChild(page, "flat", { flatNumber: "101" });
  const dupFlat = await page
    .locator('[role="dialog"]').locator('text=/already exists/i')
    .count();
  ok("duplicate flat number rejected", dupFlat > 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "ph-floor-desktop.png") });

  // ── 9. Flat detail → rooms ──
  const flat101 = await db.query(
    'SELECT id FROM "ProgressFlat" WHERE "floorId"=$1 AND "flatNumber"=$2',
    [floor1Id, "101"]
  );
  const flat101Id = flat101.rows[0].id;
  await page.goto(`${BASE}/dashboard/progress-app/flats/${flat101Id}`, {
    waitUntil: "networkidle",
  });
  const flatCrumbs = await page.locator("nav a").allTextContents();
  ok(
    "flat breadcrumb: App → Site → Wing → Floor",
    flatCrumbs.length >= 4,
    flatCrumbs.join(" | ")
  );
  await page.waitForSelector("text=No rooms added yet.", { timeout: 15000 });
  const roomDefs = [
    ["Living Room", "Living"],
    ["Bedroom 1", "Bedroom"],
    ["Bedroom 2", "Bedroom"],
    ["Kitchen", "Kitchen"],
    ["Bathroom", "Bathroom"],
  ];
  for (const [roomName, roomType] of roomDefs) {
    await addChild(page, "room", { roomName, roomType });
  }
  await page.reload({ waitUntil: "networkidle" });
  const roomCount = await db.query(
    'SELECT COUNT(*)::int n FROM "ProgressRoom" WHERE "flatId"=$1',
    [flat101Id]
  );
  ok("5 rooms created in flat 101", roomCount.rows[0].n === 5);
  const notConfigured = await page
    .locator("text=Progress not configured")
    .count();
  ok(
    "rooms show 'Progress not configured' (no fake progress)",
    notConfigured === 5,
    `badges=${notConfigured}`
  );
  await addChild(page, "room", { roomName: "Living Room" });
  const dupRoom = await page
    .locator('[role="dialog"]').locator('text=/already exists/i')
    .count();
  ok("duplicate room name rejected", dupRoom > 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "ph-flat-desktop.png") });

  // same room name allowed in flat 102
  const flat102 = await db.query(
    'SELECT id FROM "ProgressFlat" WHERE "floorId"=$1 AND "flatNumber"=$2',
    [floor1Id, "102"]
  );
  const flat102Id = flat102.rows[0].id;
  await page.goto(`${BASE}/dashboard/progress-app/flats/${flat102Id}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("text=No rooms added yet.", { timeout: 15000 });
  await addChild(page, "room", { roomName: "Living Room" });
  const r102 = await db.query(
    'SELECT COUNT(*)::int n FROM "ProgressRoom" WHERE "flatId"=$1',
    [flat102Id]
  );
  ok(
    "same room name allowed under different flat",
    r102.rows[0].n === 1
  );

  // ── 10. Deactivate Wing Alpha → descendants preserved ──
  await page.goto(siteUrl, { waitUntil: "networkidle" });
  await page.waitForSelector("tr", { timeout: 15000 });
  const wingARowEl = page.locator("tr", { hasText: "Wing Alpha" });
  await wingARowEl.locator('button[title*="Deactivate"]').click();
  const confirmDialog = page.locator('[role="dialog"]');
  await confirmDialog.waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(OUT, "ph-deactivate-confirm.png") });
  await confirmDialog
    .getByRole("button", { name: /^deactivate$/i })
    .click();
  await page.waitForTimeout(1200);
  const inactiveBadge = await wingARowEl.locator("text=Inactive").count();
  ok("deactivated wing shows Inactive badge", inactiveBadge > 0);
  const preserved = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM "ProgressFloor" WHERE "wingId"=$1) floors,
       (SELECT COUNT(*)::int FROM "ProgressFlat" f
          JOIN "ProgressFloor" fl ON f."floorId"=fl.id WHERE fl."wingId"=$1) flats,
       (SELECT COUNT(*)::int FROM "ProgressRoom" r
          JOIN "ProgressFlat" f ON r."flatId"=f.id
          JOIN "ProgressFloor" fl ON f."floorId"=fl.id WHERE fl."wingId"=$1) rooms,
       (SELECT "isActive" FROM "ProgressWing" WHERE id=$1) wing_active`,
    [wingAId]
  );
  const p = preserved.rows[0];
  ok(
    "deactivating wing preserves all descendants",
    p.floors === 3 && p.flats === 2 && p.rooms === 6 && p.wing_active === false,
    JSON.stringify(p)
  );
  const descendantsActive = await db.query(
    `SELECT COUNT(*)::int n FROM "ProgressRoom" r
       JOIN "ProgressFlat" f ON r."flatId"=f.id
       JOIN "ProgressFloor" fl ON f."floorId"=fl.id
       WHERE fl."wingId"=$1 AND r."isActive"=true AND f."isActive"=true
         AND fl."isActive"=true`,
    [wingAId]
  );
  ok(
    "descendants remain active (not cascaded)",
    descendantsActive.rows[0].n === 6
  );
  // reactivate
  await wingARowEl.locator('button[title*="Reactivate"]').click();
  await confirmDialog.waitFor({ state: "visible" });
  await confirmDialog.getByRole("button", { name: /^reactivate$/i }).click();
  await page.waitForTimeout(1200);
  const wingActive = await db.query(
    'SELECT "isActive" FROM "ProgressWing" WHERE id=$1',
    [wingAId]
  );
  ok("reactivation restores wing", wingActive.rows[0].isActive === true);

  // ── 11. Persistence after refresh ──
  await page.goto(`${BASE}/dashboard/progress-app/flats/${flat101Id}`, {
    waitUntil: "networkidle",
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("text=Living Room", { timeout: 15000 });
  const persistedRooms = await page.locator("tbody tr").count();
  ok(
    "rooms persist after refresh",
    persistedRooms === 5,
    `rows=${persistedRooms}`
  );

  // ── 12. Staff read-only ──
  const staffCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const staff = await staffCtx.newPage();
  await login(staff, "staff@saec.com", "StaffView123!");
  await staff.goto(siteUrl, { waitUntil: "networkidle" });
  await staff.waitForSelector("text=Wing Alpha", { timeout: 15000 });
  const addBtns = await staff
    .getByRole("button", { name: /add wing/i })
    .count();
  const editIcons = await staff
    .locator('button[title*="Edit wing"], button[title*="Deactivate"]')
    .count();
  ok(
    "staff sees wings but no mutation controls",
    addBtns === 0 && editIcons === 0,
    `add=${addBtns} edit=${editIcons}`
  );
  await staff.goto(`${BASE}/dashboard/progress-app/flats/${flat101Id}`, {
    waitUntil: "networkidle",
  });
  await staff.waitForSelector("text=Living Room", { timeout: 15000 });
  const staffAddRoom = await staff
    .getByRole("button", { name: /add room/i })
    .count();
  ok("staff read-only on flat/room level", staffAddRoom === 0);
  await staff.screenshot({ path: path.join(OUT, "ph-flat-staff.png") });

  // ── 13. Responsive ──
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/dashboard/progress-app/flats/${flat101Id}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("text=Living Room", { timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, "ph-flat-mobile-390.png") });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(wingAUrl, { waitUntil: "networkidle" });
  await page.waitForSelector("text=First Floor", { timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, "ph-wing-tablet-768.png") });
  ok("mobile + tablet layouts render", true);

  const fatal = errors.filter(
    (e) => !/favicon|chunk|hydration|DevTools|third-?party|preload/i.test(e)
  );
  ok("no console/page errors", fatal.length === 0, fatal[0] ?? "");

  await browser.close();
  await db.end();

  console.log("\n=== Progress Hierarchy QA results ===");
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
