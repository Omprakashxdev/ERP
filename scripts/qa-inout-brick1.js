// Brick 1 QA — In-Out Register mandatory fields, inward types, reply due
// date visibility, unique document numbers. Disposable manual_test DB.
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3100";
const OUT = path.join(__dirname, "..", "qa-shots");
fs.mkdirSync(OUT, { recursive: true });
const pickOption = async (page, sel, match) => {
  await page.locator(sel).click();
  const list = page.locator('[role="listbox"]:visible');
  await list.waitFor({ state: "visible", timeout: 5000 });
  const opt = match ? list.getByRole("option", { name: match }) : list.getByRole("option").first();
  await opt.click();
};
const results = [];
const closeDialog = async (page) => {
  for (let i = 0; i < 4; i++) {
    if (!(await page.locator('[data-slot="dialog-overlay"], [role="dialog"]').first().isVisible().catch(() => false))) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const cancel = page.getByRole("button", { name: /^cancel$/i });
    if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => {});
    await page.waitForTimeout(400);
  }
};
const dialogError = async (page) => {
  const t = await page.locator('[data-sonner-toast]').allTextContents();
  const b = await page.locator('[role="alert"]').allTextContents();
  return [...t, ...b].join(" | ").slice(0, 200);
};

const ok = (name, pass, note = "") => {
  results.push(`${pass ? "PASS" : "FAIL"} ${name}${note ? " — " + note : ""}`);
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

  // login
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"], #email', "admin@saec.com");
  await page.fill('input[type="password"], #password', "QaTest123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });
  await page.goto(BASE + "/dashboard/in-out-register", { waitUntil: "networkidle" });

  // ── New Inward form ──
  await page.getByRole("button", { name: /new inward|inward/i }).first().click();
  await page.waitForSelector("#documentRefNo", { timeout: 8000 });

  // required indicator + inline validation
  const star = await page.locator('label[for="documentRefNo"] .text-red-500').count();
  ok("doc number has * indicator", star === 1);
  const staffStar = await page.locator('label[for="actionSuggestedStaffId"] .text-red-500').count();
  ok("action-suggested-to has * indicator", staffStar === 1);
  ok("staff selector visible on inward", await page.locator("#actionSuggestedStaffId").isVisible());

  // submit empty → inline errors, no save
  await page.getByRole("button", { name: /create entry/i }).click();
  await page.waitForTimeout(400);
  const inlineErr = await page.locator("text=Document number is required.").count();
  ok("blank submit blocked w/ inline error", inlineErr === 1);
  const staffErr = await page.locator("text=Select the staff member the action is suggested to.").count();
  ok("blank staff blocked w/ inline error", staffErr === 1);

  // inward type options = exactly 2 (+ optional clear + placeholder)
  await page.locator("#inwardType").click();
  await page.waitForTimeout(300);
  const opts = await page.locator('[role="option"]').allTextContents();
  const real = opts.filter((o) => !/clear/i.test(o));
  ok("inward type = exactly 2 options", real.length === 2, JSON.stringify(real));
  ok("no Complaint/Query/Notice offered",
    !opts.some((o) => /complaint|query|notice/i.test(o)));
  await page.keyboard.press("Escape");

  // Reply Due Date hidden before type chosen
  ok("replyDueDate hidden when type unset", !(await page.locator("#replyDueDate").isVisible().catch(() => false)));

  // pick Informative → still hidden
  await pickOption(page, "#inwardType", "Informative");
  await page.waitForTimeout(200);
  ok("replyDueDate hidden for Informative", !(await page.locator("#replyDueDate").isVisible().catch(() => false)));

  // switch to Action Required → appears
  await pickOption(page, "#inwardType", "Action Required");
  await page.waitForTimeout(200);
  ok("replyDueDate shown for Action Required", await page.locator("#replyDueDate").isVisible());

  // fill + save a valid inward
  const docNo = `QA/BRICK1/${Date.now() % 100000}`;
  await page.fill("#documentRefNo", "   " + docNo + "   "); // leading/trailing spaces — trimmed
  await pickOption(page, "#clientId");
  await pickOption(page, "#actionSuggestedStaffId");
  await page.screenshot({ path: path.join(OUT, "b1-inward-form-desktop.png") });
  await page.getByRole("button", { name: /create entry/i }).click();
  await page.waitForTimeout(3000);
  const saved = !(await page.locator("#documentRefNo").isVisible().catch(() => false));
  ok("valid inward saved", saved, saved ? "" : await dialogError(page));

  // duplicate doc number (different case + spaces) → rejected
  await page.getByRole("button", { name: /new inward|inward/i }).first().click();
  await page.waitForSelector("#documentRefNo", { timeout: 8000 });
  await page.fill("#documentRefNo", "  " + docNo.toLowerCase() + " ");
  await pickOption(page, "#clientId");
  await pickOption(page, "#actionSuggestedStaffId");
  await page.getByRole("button", { name: /create entry/i }).click();
  await page.waitForTimeout(2500);
  const dupMsg = await page.locator("text=/already registered/i").count();
  ok("normalized duplicate rejected w/ message", dupMsg > 0, await dialogError(page));
  await page.screenshot({ path: path.join(OUT, "b1-duplicate-rejected.png") });
  await closeDialog(page);

  // ── New Outward form ──
  await page.getByRole("button", { name: /new outward|outward/i }).first().click();
  await page.waitForSelector("#documentRefNo", { timeout: 8000 });
  ok("staff selector visible on outward", await page.locator("#actionSuggestedStaffId").isVisible());
  ok("no inward type field on outward", !(await page.locator("#inwardType").isVisible().catch(() => false)));
  ok("no replyDueDate on outward", !(await page.locator("#replyDueDate").isVisible().catch(() => false)));
  await page.fill("#documentRefNo", `QA/OUT/${Date.now() % 100000}`);
  await pickOption(page, "#clientId");
  await pickOption(page, "#actionSuggestedStaffId");
  await page.screenshot({ path: path.join(OUT, "b1-outward-form-desktop.png") });
  await page.getByRole("button", { name: /create entry/i }).click();
  await page.waitForTimeout(3000);
  const outSaved = !(await page.locator("#documentRefNo").isVisible().catch(() => false));
  ok("valid outward saved", outSaved, outSaved ? "" : await dialogError(page));
  await closeDialog(page);

  // ── Edit legacy record (inwardType NULL) ──
  await page.fill("#in-out-search", "OUT/2026-27/001");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);
  const row = page.locator("tr", { hasText: "OUT/2026-27/001" }).first();
  if (await row.count()) {
    await row.getByRole("button", { name: /edit/i }).first().click();
    await page.waitForTimeout(1500);
    if (await page.locator("#documentRefNo").isVisible().catch(() => false)) {
      await page.screenshot({ path: path.join(OUT, "b1-legacy-edit.png") });
      // staff was NULL on this legacy row — save should demand completion
      await page.getByRole("button", { name: /save changes/i }).click();
      await page.waitForTimeout(1500);
      const reqErr = await page.locator("text=/Action suggested to is required|Select the staff member|required/i").count();
      ok("legacy edit requires staff completion", reqErr > 0, await dialogError(page));
      await closeDialog(page);
    } else {
      ok("legacy edit form opened", false, "edit dialog not found");
    }
  } else {
    ok("legacy row present", false, "OUT/2026-27/001 not in table");
  }

  // ── Mobile viewport ──
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  const hOverflow = await page.evaluate(() => document.documentElement.scrollWidth > 391);
  ok("no horizontal overflow @390px", !hOverflow);
  await page.screenshot({ path: path.join(OUT, "b1-table-mobile-390.png"), fullPage: false });

  await browser.close();
  console.log(results.join("\n"));
  console.log("JS errors:", errors.filter((e) => !/favicon|ResizeObserver|hydrat/i.test(e)).length);
  errors.filter((e) => !/favicon|ResizeObserver|hydrat/i.test(e)).slice(0, 5).forEach((e) => console.log("  " + e));
})();
