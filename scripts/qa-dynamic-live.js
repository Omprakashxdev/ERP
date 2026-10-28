// Live dynamic-data E2E driver — phased so Android verification can
// interleave. Each phase performs real ERP admin-UI work against
// PRODUCTION; ids/state persist in qa-shots/live-dynamic/state.json.
//
//   node qa-dynamic-live.js phase1   create QA-DYNAMIC site
//   node qa-dynamic-live.js phase2   assign qa-field (view+update)
//   node qa-dynamic-live.js phase3   rename site
//   node qa-dynamic-live.js phase4   upload cover A
//   node qa-dynamic-live.js phase5   replace with cover B
//   node qa-dynamic-live.js phase6   wing→floor→flat→room + checklist
//   node qa-dynamic-live.js phase7   revoke qa-field assignment
//   node qa-dynamic-live.js phase8   restore assignment
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BASE = "https://erp.adelphostech.com";
const OUT = path.join(__dirname, "..", "qa-shots", "live-dynamic");
fs.mkdirSync(OUT, { recursive: true });
const STATE = path.join(OUT, "state.json");
const state = fs.existsSync(STATE)
  ? JSON.parse(fs.readFileSync(STATE, "utf8"))
  : {};
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2));

const results = [];
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
const shot = (page, name) =>
  page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: true });

// Generate a clearly identifiable cover PNG on the host (real image).
function makeCover(file, r, g, b, label) {
  execSync(
    `python3 -c "
from PIL import Image, ImageDraw
im = Image.new('RGB', (900, 500), (${r}, ${g}, ${b}))
d = ImageDraw.Draw(im)
d.rectangle([40, 40, 860, 460], outline=(255,255,255), width=8)
d.text((80, 230), '${label}', fill=(255,255,255))
im.save('${file}')
"`
  );
  return file;
}

async function login(page) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"], input[name="email"], #email',
    "qa-admin@saec-qa.local");
  await page.fill('input[type="password"], input[name="password"], #password',
    process.env.QA_ADMIN_PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 20000 });
}

async function gotoSite(page) {
  await page.goto(
    `${BASE}/dashboard/progress-app/sites/${state.siteId}`,
    { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 20000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function openEdit(page) {
  await page.locator('button:has-text("Edit")').first().click();
  await page.waitForSelector("#siteName", { timeout: 8000 });
}

async function saveEdit(page) {
  await page.click('button[type="submit"]:has-text("Save changes")');
  await page.waitForTimeout(2200);
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function addChild(page, singular, fields) {
  // The "Add wing/floor/flat/room" opener — exact singular text.
  await page
    .locator(`button:has-text("Add ${singular}")`)
    .first()
    .click();
  await page.waitForSelector(
    `[role="dialog"] >> text=Add ${singular}`,
    { timeout: 8000 }
  );
  for (const [id, val] of Object.entries(fields)) {
    await page.fill(`#hc-${id}`, val);
  }
  await page.locator('[role="dialog"]')
    .locator(`button[type="submit"]:has-text("Add ${singular}")`)
    .click();
  await page.waitForTimeout(1800);
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function openRow(page, text) {
  // The drill link carries the idKey (code/number), not the display
  // name — pick the anchor inside the row that contains the name.
  await page.locator(`tr:has-text("${text}") a`).first().click();
  await page.waitForSelector("h1", { timeout: 15000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

(async () => {
  const phase = process.argv[2];
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 160)));
  await login(page);
  check("admin login", page.url().includes("/dashboard"));

  if (phase === "phase1") {
    const tag = new Date().toISOString().slice(11, 16).replace(":", "");
    state.code = `QA-DYN-${tag}`;
    state.name = `QA Dynamic Site ${tag}`;
    await page.goto(BASE + "/dashboard/progress-app",
      { waitUntil: "networkidle" });
    await page.locator('button:has-text("New Site")').first().click();
    await page.waitForSelector("#siteCode", { timeout: 8000 });
    await page.fill("#siteCode", state.code);
    await page.fill("#siteName", state.name);
    await page.fill("#city", "QA City");
    await page.locator("#status").click();
    await page.locator('[role="option"]:has-text("Active")').first().click();
    await shot(page, "a1-new-site-form");
    await page.click('button[type="submit"]:has-text("Create site")');
    await page.waitForURL(/sites\//, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const m = page.url().match(/sites\/([^/?#]+)/);
    state.siteId = m ? m[1] : null;
    check("site created → redirected to detail", !!state.siteId,
      page.url());
    await shot(page, "a2-site-detail-after-create");
    save();
  }

  if (phase === "phase2") {
    await gotoSite(page);
    // Two controls contain "Assign staff": the setup-card CTA (scrolls
    // to #site-assignments) and the dialog opener in the assignments
    // card header — target the latter.
    await page.locator('button:has-text("Assign staff")').last().click();
    await page.waitForSelector("#assign-user", { timeout: 8000 });
    await page.locator("#assign-user").click();
    await page
      .locator('[role="option"]')
      .filter({ hasText: /qa.?field/i })
      .first()
      .click();
    // canUpdate implies canView — check "Can update progress".
    const boxes = page.locator('[role="dialog"] input[type="checkbox"]');
    await boxes.nth(1).check();
    await shot(page, "b1-assign-dialog");
    await page.locator('[role="dialog"] button:has-text("Assign")')
      .first().click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle").catch(() => {});
    const row = page.locator('td:has-text("qa-field@saec-qa.local")');
    check("qa-field row appears in assignments", await row.count() >= 1);
    await shot(page, "b2-assigned");
  }

  if (phase === "phase3") {
    state.renamed = state.name + " RENAMED";
    await gotoSite(page);
    await openEdit(page);
    await page.fill("#siteName", state.renamed);
    await shot(page, "c1-edit-rename");
    await saveEdit(page);
    check("renamed title shows", await page
      .locator(`h1:has-text("${state.renamed}")`).first()
      .isVisible().catch(() => false));
    await shot(page, "c2-renamed");
  }

  if (phase === "phase4") {
    const coverA = makeCover(
      path.join(OUT, "coverA.png"), 30, 90, 160, "COVER A");
    await gotoSite(page);
    await openEdit(page);
    await page.locator('input[type="file"][accept*="webp"]')
      .setInputFiles(coverA);
    await page.waitForTimeout(800);
    check("cover A preview", await page
      .locator('img[alt="New cover preview"]').isVisible()
      .catch(() => false));
    await shot(page, "d1-cover-a-preview");
    await saveEdit(page);
    const img = page.locator('img[src*="/api/site-covers/"]').first();
    check("cover A saved — header img", await img.isVisible()
      .catch(() => false));
    state.coverSrcA = await img.getAttribute("src").catch(() => null);
    await shot(page, "d2-cover-a-saved");
    save();
  }

  if (phase === "phase5") {
    const coverB = makeCover(
      path.join(OUT, "coverB.png"), 160, 60, 30, "COVER B");
    await gotoSite(page);
    await openEdit(page);
    await page.locator('input[type="file"][accept*="webp"]')
      .setInputFiles(coverB);
    await page.waitForTimeout(800);
    await shot(page, "e1-cover-b-preview");
    await saveEdit(page);
    const img = page.locator('img[src*="/api/site-covers/"]').first();
    const src = await img.getAttribute("src").catch(() => null);
    check("cover B saved — new img src differs", !!src &&
      src !== state.coverSrcA, String(src));
    state.coverSrcB = src;
    await shot(page, "e2-cover-b-saved");
    save();
  }

  if (phase === "phase6") {
    await gotoSite(page);
    // Site detail embeds wing children — add Wing A (idempotent).
    if (!(await page.locator('tr:has-text("Wing A")').count())) {
      await addChild(page, "wing",
        { code: "A", name: "Wing A", displayOrder: "0" });
    }
    await shot(page, "f1-wing-added");
    check("Wing A row", await page.locator('tr:has-text("Wing A")')
      .first().isVisible().catch(() => false));
    await openRow(page, "Wing A");
    state.wingId = page.url().match(/wings\/([^/?#]+)/)?.[1];
    await addChild(page, "floor",
      { floorIdentifier: "1", displayName: "Floor 1", displayOrder: "0" });
    await shot(page, "f2-floor-added");
    await openRow(page, "Floor 1");
    state.floorId = page.url().match(/floors\/([^/?#]+)/)?.[1];
    await addChild(page, "flat",
      { flatNumber: "101", flatType: "2BHK", displayOrder: "0" });
    await shot(page, "f3-flat-added");
    await openRow(page, "101");
    state.flatId = page.url().match(/flats\/([^/?#]+)/)?.[1];
    await addChild(page, "room",
      { roomName: "Living Room", roomType: "Living", displayOrder: "0" });
    await shot(page, "f4-room-added");
    await openRow(page, "Living Room");
    state.roomId = page.url().match(/rooms\/([^/?#]+)/)?.[1];
    check("reached room page", !!state.roomId, page.url());
    await shot(page, "f5-room-page");
    // Assign checklist via the room page control.
    await page
      .locator('button:has-text("Assign"), button:has-text("checklist")')
      .first()
      .click();
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
    await page.locator('[role="dialog"] [role="combobox"]').first().click();
    await page
      .locator('[role="option"]:has-text("QA-LIVE Room Checklist")')
      .first()
      .click();
    await page.waitForTimeout(1200);
    await shot(page, "f6-checklist-dialog");
    await page.locator('[role="dialog"] button:has-text("Assign")')
      .last().click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle").catch(() => {});
    check("checklist assigned — activities listed", await page
      .locator("text=Activity checklist").first().isVisible()
      .catch(() => false));
    await shot(page, "f7-checklist-assigned");
    save();
  }

  if (phase === "phase9") {
    // Rename Wing A's display name via the row edit dialog.
    await gotoSite(page);
    await page.locator('tr:has-text("Wing A") button[title^="Edit"]')
      .first().click();
    await page.waitForSelector('[role="dialog"] #hc-name', { timeout: 8000 });
    await page.fill("#hc-name", "Wing A — Alpha");
    await shot(page, "d1-edit-wing");
    await page.locator('[role="dialog"] button[type="submit"]').click();
    await page.waitForTimeout(1800);
    await page.waitForLoadState("networkidle").catch(() => {});
    check("wing renamed in table", await page
      .locator('tr:has-text("Wing A — Alpha")').first().isVisible()
      .catch(() => false));
    await shot(page, "d2-wing-renamed");
  }

  if (phase === "phase10") {
    // Read-back: ERP room page shows the app-pushed status/history/photo.
    await page.goto(`${BASE}/dashboard/progress-app/rooms/${state.roomId}`,
      { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1", { timeout: 15000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    check("ERP shows In Progress", await page
      .locator("text=In Progress").first().isVisible().catch(() => false));
    check("ERP shows mobile note", await page
      .locator("text=Brickwork_started_E2E_live_test").first().isVisible()
      .catch(() => false));
    check("ERP shows history actor", await page
      .locator("text=QA Field Tester").first().isVisible().catch(() => false));
    check("ERP shows uploaded photo", await page
      .locator("text=sitephoto-e2e").first().isVisible().catch(() => false));
    await shot(page, "e3-erp-room-readback");
  }

  if (phase === "phase7") {
    await gotoSite(page);
    const revokeBtn = page.locator(
      'tr:has-text("qa-field@saec-qa.local") button:has-text("Revoke")');
    check("revoke control present", await revokeBtn.count() >= 1);
    await revokeBtn.first().click();
    await page.locator('[role="dialog"] button:has-text("Revoke")')
      .last().click();
    await page.waitForTimeout(2000);
    check("row shows Revoked", await page
      .locator('tr:has-text("qa-field@saec-qa.local") >> text=Revoked')
      .first().isVisible().catch(() => false));
    await shot(page, "g1-revoked");
  }

  if (phase === "phase8") {
    await gotoSite(page);
    await page.locator(
      'tr:has-text("qa-field@saec-qa.local") button:has-text("Reactivate")')
      .first().click();
    await page.waitForTimeout(2000);
    check("row active again", await page
      .locator('tr:has-text("qa-field@saec-qa.local") >> text=Active')
      .first().isVisible().catch(() => false));
    await shot(page, "g2-restored");
  }

  console.log(`\n=== ${phase} RESULTS ===`);
  for (const r of results) console.log(r);
  if (consoleErrors.length) {
    console.log(`console errors: ${consoleErrors.length}`);
    consoleErrors.slice(0, 5).forEach((e) => console.log("  " + e));
  }
  await browser.close();
  process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
})();
