// Employee-code standardization QA — disposable manual_test DB.
// Verifies: read-only code field, server-generated SAEC code on create,
// generated code shown in success toast, and read-only display on edit.
const { chromium } = require("@playwright/test");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3100";
const OUT = path.join(__dirname, "..", "qa-shots");
fs.mkdirSync(OUT, { recursive: true });
const RUN = `EC${(Date.now() % 100000).toString(36)}`;
const DB_URL = process.env.QA_DATABASE_URL;

const psql = (sql) =>
  execSync(`/opt/homebrew/opt/postgresql@15/bin/psql "${DB_URL}" -At`, {
    input: sql,
  }).toString().trim();

const results = [];
const ok = (name, pass, note = "") =>
  results.push(`${pass ? "PASS" : "FAIL"} ${name}${note ? " — " + note : ""}`);

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

  // ── 1. New Staff: code field is read-only placeholder ──
  await page.goto(BASE + "/dashboard/employee", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /new staff/i }).click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible", timeout: 8000 });
  const codeEl = page.locator("#staff-code");
  const tag = await codeEl.evaluate((el) => el.tagName);
  const codeText = (await codeEl.textContent())?.trim();
  ok(
    "new-staff code is read-only (not an input)",
    tag !== "INPUT" && /automatically generated/i.test(codeText ?? ""),
    `${tag}: "${codeText}"`
  );
  const editableInput = await page.locator('input#staff-code').count();
  ok("no editable employee-code input", editableInput === 0);

  // ── 2. Create → generated SAEC code in toast + DB ──
  const name = `QA Emp ${RUN}`;
  await page.fill("#staff-name", name);
  await page.getByRole("button", { name: /create|save/i }).last().click();
  const toast = page.locator("[data-sonner-toast]", {
    hasText: /Employee Code SAEC\d+/i,
  });
  const toastShown = await toast
    .waitFor({ state: "visible", timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  ok("generated code shown on create", toastShown);
  const dbCode = psql(
    `SELECT "employeeCode" FROM "Staff" WHERE name='${name}' ORDER BY "createdAt" DESC LIMIT 1`
  );
  ok(
    "SAECnnn code persisted",
    /^SAEC\d+$/.test(dbCode),
    dbCode
  );
  await page.screenshot({ path: path.join(OUT, "ec-created.png") });
  await page.keyboard.press("Escape");

  // ── 3. Edit existing staff → code read-only with value ──
  await page.waitForTimeout(800);
  const row = page.locator("tr", { hasText: name }).first();
  await row.locator('button[title="Edit staff details"]').click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible", timeout: 8000 });
  const editCodeEl = page.locator("#staff-code");
  const editTag = await editCodeEl.evaluate((el) => el.tagName);
  const editCodeText = (await editCodeEl.textContent())?.trim();
  ok(
    "edit shows code read-only",
    editTag !== "INPUT" && editCodeText === dbCode,
    `${editTag}: "${editCodeText}"`
  );
  await page.screenshot({ path: path.join(OUT, "ec-edit.png") });
  await page.keyboard.press("Escape");

  // ── 4. Codes unique + sequential in table view ──
  const allCodes = psql(`SELECT "employeeCode" FROM "Staff" WHERE "employeeCode" IS NOT NULL ORDER BY "employeeCode"`).split("\n");
  const allSaec = allCodes.every((c) => /^SAEC\d+$/.test(c));
  const unique = new Set(allCodes).size === allCodes.length;
  ok("all employee codes are unique SAEC format", allSaec && unique, allCodes.join(","));

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
