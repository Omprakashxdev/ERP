// Brick 2 QA — Inward "Related Project" association:
// client-filtered searchable dropdown, General Correspondence default,
// persistence on save/reopen, client-change clearing, outward read-only
// inherited project, list filter, and Brick 1 smoke (Masters Projects +
// Fund Flow). Runs against the disposable rehearsal DB on :3100.
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3100";
const OUT = path.join(__dirname, "..", "qa-shots", "brick2");
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, pass, note = "") => {
  results.push(`${pass ? "PASS" : "FAIL"} ${name}${note ? " — " + note : ""}`);
};
const closeDialog = async (page) => {
  for (let i = 0; i < 4; i++) {
    if (!(await page.locator('[role="dialog"]').first().isVisible().catch(() => false))) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const cancel = page.getByRole("button", { name: /^cancel$/i });
    if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => {});
    await page.waitForTimeout(400);
  }
};
const pickOption = async (page, sel, match) => {
  await page.locator(sel).click();
  const list = page.locator('[role="listbox"]:visible');
  await list.waitFor({ state: "visible", timeout: 5000 });
  const opt = match ? list.getByRole("option", { name: match }) : list.getByRole("option").first();
  await opt.click();
};
const pickClient = async (page, name) => {
  await page.locator("#clientId").click();
  const list = page.locator('[role="listbox"]:visible');
  await list.waitFor({ state: "visible", timeout: 5000 });
  await list.getByRole("option", { name }).click();
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 160));
  });

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"], #email', "admin@saec.com");
  await page.fill('input[type="password"], #password', "QaTest123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });

  // ── Brick 1 smoke: Masters → Projects tab ──
  await page.goto(BASE + "/dashboard/masters?tab=projects", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const projectsTableVisible = await page.locator("text=/Project/i").first().isVisible();
  const newProjectBtn = await page.getByRole("button", { name: /new project/i }).isVisible().catch(() => false);
  ok("Masters Projects tab renders", projectsTableVisible);
  ok("Masters New Project button present", newProjectBtn);
  await page.screenshot({ path: path.join(OUT, "b2-masters-projects.png"), fullPage: true });

  // ── Brick 1 smoke: Fund Flow — no New Project button, rows render ──
  await page.goto(BASE + "/dashboard/fund-flow", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const ffNewProject = await page.getByRole("button", { name: /new project/i }).count();
  ok("Fund Flow has NO New Project button", ffNewProject === 0, `count=${ffNewProject}`);
  const ffRows = await page.locator("table tbody tr").count();
  ok("Fund Flow projects listed", ffRows > 0, `${ffRows} rows`);
  await page.screenshot({ path: path.join(OUT, "b2-fund-flow.png"), fullPage: true });

  // ── Inward form: Related Project field ──
  await page.goto(BASE + "/dashboard/in-out-register", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /new inward/i }).first().click();
  await page.waitForSelector("#documentRefNo", { timeout: 8000 });

  ok("Related Project trigger visible on inward", await page.locator("#projectId").isVisible());
  const placeholder = await page.locator("#projectId").textContent();
  ok("placeholder = General Correspondence", /general correspondence/i.test(placeholder ?? ""), placeholder?.trim());

  // Select client GUDM → dropdown filtered to its 4 projects
  await pickClient(page, "GUDM");
  await page.locator("#projectId").click();
  await page.waitForSelector('[role="dialog"] [cmdk-input], [cmdk-input]', { timeout: 5000 });
  await page.screenshot({ path: path.join(OUT, "b2-project-picker-gudm.png") });
  const gudmItems = await page.locator('[cmdk-item]').allTextContents();
  const gudmReal = gudmItems.filter((t) => !/general correspondence/i.test(t));
  ok("dropdown filtered to GUDM projects", gudmReal.length === 4, JSON.stringify(gudmReal.map((t) => t.trim().slice(0, 40))));
  ok("General Correspondence option present", gudmItems.some((t) => /general correspondence/i.test(t)));

  // Search filter inside the picker
  await page.fill('[cmdk-input]', "Wadhvan");
  await page.waitForTimeout(400);
  const searched = await page.locator('[cmdk-item]:visible').allTextContents();
  ok("picker search narrows results", searched.length === 1 && /wadhvan/i.test(searched[0]), JSON.stringify(searched));

  // Pick GUDM Wadhvan TPI
  await page.locator('[cmdk-item]:visible').first().click();
  await page.waitForTimeout(300);
  const chosen = await page.locator("#projectId").textContent();
  ok("project selected shows name", /wadhvan/i.test(chosen ?? ""), chosen?.trim());

  // Change client → incompatible project cleared
  await pickClient(page, "GSPHC");
  await page.waitForTimeout(300);
  const afterClientChange = await page.locator("#projectId").textContent();
  ok("client change clears incompatible project", /general correspondence/i.test(afterClientChange ?? ""), afterClientChange?.trim());

  // GSPHC projects only
  await page.locator("#projectId").click();
  await page.waitForSelector('[cmdk-item]', { timeout: 5000 });
  const gsphcItems = await page.locator('[cmdk-item]').allTextContents();
  const gsphcReal = gsphcItems.filter((t) => !/general correspondence/i.test(t));
  ok("dropdown re-filters to GSPHC", gsphcReal.length === 1 && /gsphc/i.test(gsphcReal[0]), JSON.stringify(gsphcReal));

  // Save an inward WITH a project
  await page.locator('[cmdk-item]:visible', { hasText: /gsphc/i }).first().click();
  const docNo = `QA/BRICK2/${Date.now() % 100000}`;
  await page.fill("#documentRefNo", docNo);
  await pickOption(page, "#actionSuggestedStaffId");
  await page.screenshot({ path: path.join(OUT, "b2-inward-with-project.png") });
  await page.getByRole("button", { name: /create entry/i }).click();
  await page.waitForTimeout(3500);
  const saved = !(await page.locator("#documentRefNo").isVisible().catch(() => false));
  ok("inward with project saved", saved);

  // Project column shows the project in the list
  await page.waitForTimeout(1000);
  const projRow = page.locator("tr", { hasText: docNo }).first();
  const rowText = await projRow.textContent();
  ok("project name shown in list row", /GSPHC Abad/i.test(rowText ?? ""), rowText?.slice(0, 140));

  // Reopen → project preserved; clear → General Correspondence
  if (await projRow.count()) {
    await projRow.getByRole("button", { name: /edit/i }).first().click();
    await page.waitForSelector("#documentRefNo", { timeout: 8000 });
    const reopened = await page.locator("#projectId").textContent();
    ok("project preserved on reopen", /GSPHC Abad/i.test(reopened ?? ""), reopened?.trim());
    await page.screenshot({ path: path.join(OUT, "b2-inward-edit-preserved.png") });

    // Edit → switch to General Correspondence → save → cleared
    await page.locator("#projectId").click();
    await page.waitForSelector('[cmdk-item]', { timeout: 5000 });
    await page.locator('[cmdk-item]', { hasText: /general correspondence/i }).first().click();
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.waitForTimeout(3000);
    const clearedRow = page.locator("tr", { hasText: docNo }).first();
    const clearedText = await clearedRow.textContent().catch(() => "");
    ok("cleared to general correspondence persists", clearedText !== null && !/GSPHC Abad/i.test(clearedText ?? ""), clearedText?.slice(0, 140));
  }

  // ── Outward form: NO editable project field ──
  await closeDialog(page);
  await page.getByRole("button", { name: /new outward/i }).first().click();
  await page.waitForSelector("#documentRefNo", { timeout: 8000 });
  ok("no Related Project field on outward", !(await page.locator("#projectId").isVisible().catch(() => false)));
  ok("no project label on outward", (await page.locator('label[for="projectId"]').count()) === 0);
  await page.screenshot({ path: path.join(OUT, "b2-outward-no-project.png") });
  await closeDialog(page);

  // ── Outward reply inherits inward project (read-only) ──
  // First re-link the inward entry to its project via edit, then reply
  const relinkRow = page.locator("tr", { hasText: docNo }).first();
  if (await relinkRow.count()) {
    await relinkRow.getByRole("button", { name: /edit/i }).first().click();
    await page.waitForSelector("#documentRefNo", { timeout: 8000 });
    await page.locator("#projectId").click();
    await page.waitForSelector('[cmdk-item]', { timeout: 5000 });
    await page.locator('[cmdk-item]:visible', { hasText: /gsphc/i }).first().click();
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.waitForTimeout(3000);

    const refreshedRow = page.locator("tr", { hasText: docNo }).first();
    const replyBtn = refreshedRow.getByRole("button", { name: /reply/i });
    if (await replyBtn.count()) {
      await replyBtn.first().click();
      await page.waitForSelector("#documentRefNo", { timeout: 8000 });
      const bannerText = await page.locator("text=/linked to inward|related project/i").allTextContents();
      ok("outward reply shows inherited project read-only", bannerText.some((t) => /gsphc abad/i.test(t)), JSON.stringify(bannerText.slice(0, 3)));
      ok("still no editable project on outward reply", !(await page.locator("#projectId").isVisible().catch(() => false)));
      await page.screenshot({ path: path.join(OUT, "b2-outward-inherited-project.png") });
      await closeDialog(page);
    } else {
      ok("reply button available on linked inward", false, "no Reply button on row");
    }
  }

  // ── Project filter on the list ──
  await page.goto(BASE + "/dashboard/in-out-register", { waitUntil: "networkidle" });
  await page.locator("#in-out-register-project").click();
  const flist = page.locator('[role="listbox"]:visible');
  await flist.waitFor({ state: "visible", timeout: 5000 });
  await flist.getByRole("option", { name: /GSPHC Abad/i }).click();
  await page.getByRole("button", { name: /apply filters/i }).click();
  await page.waitForTimeout(2000);
  const filteredRows = await page.locator("table tbody tr").count();
  const filteredText = await page.locator("table tbody").textContent();
  ok("project filter narrows list", filteredRows >= 1 && /GSPHC Abad/i.test(filteredText ?? ""), `${filteredRows} rows`);
  await page.screenshot({ path: path.join(OUT, "b2-list-filtered-project.png"), fullPage: true });

  // ── Mobile viewport ──
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/dashboard/in-out-register", { waitUntil: "networkidle" });
  const hOverflow = await page.evaluate(() => document.documentElement.scrollWidth > 391);
  ok("no horizontal overflow @390px", !hOverflow);
  await page.screenshot({ path: path.join(OUT, "b2-list-mobile-390.png") });

  await browser.close();
  console.log(results.join("\n"));
  const realErrors = errors.filter((e) => !/favicon|ResizeObserver|hydrat|deprecated/i.test(e));
  console.log("JS errors:", realErrors.length);
  realErrors.slice(0, 5).forEach((e) => console.log("  " + e));
})();
