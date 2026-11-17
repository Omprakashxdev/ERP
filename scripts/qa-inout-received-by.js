// In-Out "Received by" employee dropdown QA — disposable manual_test DB.
const { chromium } = require("@playwright/test");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3100";
const OUT = path.join(__dirname, "..", "qa-shots");
fs.mkdirSync(OUT, { recursive: true });
const RUN = `RB${(Date.now() % 100000).toString(36)}`;
const DB_URL = process.env.QA_DATABASE_URL;

const psql = (sql) =>
  execSync(`/opt/homebrew/opt/postgresql@15/bin/psql "${DB_URL}" -At`, {
    input: sql,
  }).toString().trim();

const results = [];
const ok = (name, pass, note = "") =>
  results.push(`${pass ? "PASS" : "FAIL"} ${name}${note ? " — " + note : ""}`);

const closeDialog = async (page) => {
  for (let i = 0; i < 4; i++) {
    if (
      !(await page
        .locator('[data-slot="dialog-overlay"], [role="dialog"]')
        .first()
        .isVisible()
        .catch(() => false))
    )
      return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const cancel = page.getByRole("button", { name: /^cancel$/i });
    if (await cancel.isVisible().catch(() => false))
      await cancel.click().catch(() => {});
    await page.waitForTimeout(400);
  }
};

// fill the fields that are mandatory for any new inward entry
const fillRequired = async (page, docRef) => {
  await page.fill("#documentRefNo", docRef);
  await page.locator("#clientId").click();
  await page
    .locator('[role="listbox"]:visible [role="option"]')
    .first()
    .click();
  await page.locator("#actionSuggestedStaffId").click();
  await page
    .locator('[role="listbox"]:visible [role="option"]')
    .first()
    .click();
};

const openNewInward = async (page) => {
  await page.goto(BASE + "/dashboard/in-out-register", {
    waitUntil: "networkidle",
  });
  await page
    .getByRole("button", { name: /new inward|inward entry|new entry/i })
    .first()
    .click();
  await page
    .locator('[role="dialog"]')
    .waitFor({ state: "visible", timeout: 8000 });
};

const searchAndOpen = async (page, text) => {
  await page.goto(BASE + "/dashboard/in-out-register", {
    waitUntil: "networkidle",
  });
  await page.fill("#in-out-search", text);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  const row = page.locator("tr", { hasText: text }).first();
  await row.waitFor({ state: "visible", timeout: 8000 });
  await row.click();
  await page
    .locator('[role="dialog"]')
    .waitFor({ state: "visible", timeout: 8000 });
};

(async () => {
  // pick one active staff for linking; a second for the deactivate test
  const staffRows = psql(
    `SELECT string_agg(id || '|' || name, ',') FROM (SELECT id, name FROM "Staff" WHERE "isActive" ORDER BY name LIMIT 2) s`
  ).split(",");
  const staffA = { id: staffRows[0].split("|")[0], name: staffRows[0].split("|")[1] };
  const staffB = { id: staffRows[1].split("|")[0], name: staffRows[1].split("|")[1] };
  const legacyRow = psql(
    `SELECT "receivedByPersonName" FROM "InOutRegister" WHERE "receivedByPersonName" IS NOT NULL AND direction='INWARD' LIMIT 1`
  );

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

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"], #email', "admin@saec.com");
  await page.fill('input[type="password"], #password', "QaTest123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });

  // ── 1. combobox present + searchable ──
  await openNewInward(page);
  const trigger = page.locator("#receivedByStaffId");
  ok("received-by combobox present", await trigger.isVisible());
  await trigger.click();
  await page
    .locator('[placeholder*="Search employee"]')
    .waitFor({ state: "visible", timeout: 5000 });
  const totalOptions = await page.locator('[cmdk-item]').count();
  const allStaffCount = parseInt(psql(`SELECT COUNT(*) FROM "Staff"`), 10);
  const inactiveCount = parseInt(
    psql(`SELECT COUNT(*) FROM "Staff" WHERE "isActive"=false`),
    10
  );
  ok(
    "all employees listed (active + inactive)",
    totalOptions === allStaffCount,
    `${totalOptions}/${allStaffCount} items`
  );
  const disabledOptions = await page
    .locator('[cmdk-item][data-disabled="true"]')
    .count();
  ok(
    "inactive employees shown as disabled",
    disabledOptions === inactiveCount,
    `${disabledOptions} disabled / ${inactiveCount} inactive`
  );
  await page.fill('[placeholder*="Search employee"]', staffA.name.slice(0, 5));
  await page.waitForTimeout(400);
  const filtered = await page.locator('[cmdk-item]:visible').count();
  ok("search filters employees", filtered >= 1 && filtered < totalOptions, `${filtered}/${totalOptions}`);
  await page.screenshot({ path: path.join(OUT, "rb-search.png") });
  await page.locator('[cmdk-item]').first().click();
  await page.waitForTimeout(300);
  const chosenLabel = await trigger.textContent();
  ok(
    "selection shows in trigger",
    chosenLabel.includes(staffA.name),
    chosenLabel.trim()
  );

  // ── 2. save + reopen → selection persists ──
  await fillRequired(page, `QA-${RUN}-INW-1`);
  await page.getByRole("button", { name: /create entry|save changes/i }).click();
  await page
    .locator("[data-sonner-toast]", { hasText: /saved successfully/i })
    .waitFor({ state: "visible", timeout: 8000 })
    .catch(() => {});
  await closeDialog(page);
  const savedId = psql(
    `SELECT "receivedByStaffId" FROM "InOutRegister" WHERE "documentRefNo"='QA-${RUN}-INW-1'`
  );
  ok("staffId persisted in DB", savedId === staffA.id, savedId);
  await searchAndOpen(page, `QA-${RUN}-INW-1`);
  const reopened = await page.locator("#receivedByStaffId").textContent();
  ok(
    "selection persists after reopen",
    reopened.includes(staffA.name),
    reopened.trim()
  );
  await page.screenshot({ path: path.join(OUT, "rb-persist.png") });
  await closeDialog(page);

  // ── 3. clear via "— (clear)" ──
  await searchAndOpen(page, `QA-${RUN}-INW-1`);
  await page.locator("#receivedByStaffId").click();
  await page.locator('[cmdk-item]', { hasText: "clear" }).first().click();
  await page.getByRole("button", { name: /save changes/i }).click();
  await page.waitForTimeout(1500);
  await closeDialog(page);
  const clearedId = psql(
    `SELECT COALESCE("receivedByStaffId",'NULL') FROM "InOutRegister" WHERE "documentRefNo"='QA-${RUN}-INW-1'`
  );
  ok("clear removes link", clearedId === "NULL", clearedId);

  // ── 4. legacy manual name preserved + visible ──
  if (legacyRow) {
    // find the serial/ref to search — search by the manual name via DB to get documentRefNo
    const ref = psql(
      `SELECT COALESCE("documentRefNo","serialNo") FROM "InOutRegister" WHERE "receivedByPersonName"='${legacyRow.replace(/'/g, "''")}' AND direction='INWARD' LIMIT 1`
    );
    await searchAndOpen(page, ref);
    const trigText = await page.locator("#receivedByStaffId").textContent();
    ok(
      "legacy manual name shown as (manual entry)",
      trigText.includes(legacyRow.slice(0, 8)) && trigText.includes("manual entry"),
      trigText.trim().slice(0, 80)
    );
    const hint = await page.locator("text=/Manual entry from before/i").count();
    ok("preserved-note caption visible", hint > 0);
    await page.screenshot({ path: path.join(OUT, "rb-legacy.png") });
    await closeDialog(page);
  } else {
    ok("legacy manual name shown", false, "no legacy row in DB");
  }

  // ── 5. inactive employee preserved on existing record ──
  await openNewInward(page);
  await fillRequired(page, `QA-${RUN}-INW-2`);
  await page.locator("#receivedByStaffId").click();
  await page.fill('[placeholder*="Search employee"]', staffB.name.slice(0, 5));
  await page.waitForTimeout(400);
  await page.locator('[cmdk-item]').first().click();
  await page.getByRole("button", { name: /create entry/i }).click();
  await page.waitForTimeout(1500);
  await closeDialog(page);
  // deactivate staffB via DB, then reopen
  psql(`UPDATE "Staff" SET "isActive"=false WHERE id='${staffB.id}'`);
  await searchAndOpen(page, `QA-${RUN}-INW-2`);
  const inactText = await page.locator("#receivedByStaffId").textContent();
  ok(
    "deactivated employee preserved on record",
    inactText.includes(staffB.name) && inactText.includes("inactive"),
    inactText.trim().slice(0, 80)
  );
  // and the dropdown must show the inactive staff as a DISABLED item, never pickable
  await page.locator("#receivedByStaffId").click();
  await page.waitForTimeout(400);
  const inactiveShown = await page
    .locator(`[cmdk-item][data-disabled="true"]:has-text("${staffB.name}")`)
    .count();
  ok(
    "inactive employee visible but disabled in list",
    inactiveShown === 1
  );
  const inactivePickable = await page
    .locator(`[cmdk-item]:not([data-disabled="true"]):has-text("${staffB.name}")`)
    .count();
  ok(
    "inactive employee not selectable for new picks",
    inactivePickable === 0
  );
  await page.keyboard.press("Escape");
  await closeDialog(page);
  psql(`UPDATE "Staff" SET "isActive"=true WHERE id='${staffB.id}'`);

  // ── 6. mobile layout ──
  const mctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    storageState: await ctx.storageState(),
  });
  const mp = await mctx.newPage();
  await mp.goto(BASE + "/dashboard/in-out-register", {
    waitUntil: "networkidle",
  });
  await mp
    .getByRole("button", { name: /new inward|inward entry|new entry/i })
    .first()
    .click();
  await mp.locator('[role="dialog"]').waitFor({ state: "visible", timeout: 8000 });
  const mTrigger = mp.locator("#receivedByStaffId");
  ok("mobile: combobox renders", await mTrigger.isVisible());
  await mTrigger.click();
  await mp
    .locator('[placeholder*="Search employee"]')
    .waitFor({ state: "visible", timeout: 5000 });
  await mp.fill('[placeholder*="Search employee"]', staffA.name.slice(0, 5));
  await mp.waitForTimeout(400);
  const mPick = await mp.locator('[cmdk-item]:visible').count();
  ok("mobile: search + options usable", mPick >= 1);
  await mp.screenshot({ path: path.join(OUT, "rb-mobile.png") });
  await mctx.close();

  console.log("\n===== RESULTS =====");
  results.forEach((r) => console.log(r));
  const fails = results.filter((r) => r.startsWith("FAIL"));
  if (errors.length) console.log("PAGE ERRORS:", errors.slice(0, 5));
  console.log(fails.length === 0 ? "ALL PASS" : `${fails.length} FAILURES`);
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => {
  console.error("QA crashed:", e);
  results.forEach((r) => console.log(r));
  process.exit(1);
});
