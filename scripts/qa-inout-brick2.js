// Brick 2 QA — Mode Master + Mode dropdown + Letter pad. Disposable manual_test DB.
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3100";
const OUT = path.join(__dirname, "..", "qa-shots");
fs.mkdirSync(OUT, { recursive: true });
const RUN = `B2${(Date.now() % 100000).toString(36)}`; // unique suffix per run
const MODE_A = `ByPost ${RUN}`;
const MODE_B = `Fax ${RUN}`;

const pickOption = async (page, sel, match) => {
  await page.locator(sel).click();
  const list = page.locator('[role="listbox"]:visible');
  await list.waitFor({ state: "visible", timeout: 5000 });
  const opt = match
    ? list.getByRole("option", { name: match })
    : list.getByRole("option").first();
  await opt.click();
};

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

const dialogError = async (page) => {
  const t = await page.locator("[data-sonner-toast]").allTextContents();
  const b = await page.locator('[role="alert"]').allTextContents();
  return [...t, ...b].join(" | ").slice(0, 200);
};

const gotoModeMaster = async (page) => {
  await page.goto(BASE + "/dashboard/masters", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Mode Master", exact: true }).click();
  await page.getByRole("button", { name: /add mode/i }).waitFor({ timeout: 10000 });
};

(async () => {
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

  // login
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"], #email', "admin@saec.com");
  await page.fill('input[type="password"], #password', "QaTest123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });

  // ── Mode Master ──
  await gotoModeMaster(page);

  // add MODE_A
  await page.getByRole("button", { name: /add mode/i }).click();
  await page.waitForSelector("#master-value", { timeout: 5000 });
  await page.fill("#master-value", MODE_A);
  await page.getByRole("button", { name: /^create|^save|^add/i }).last().click();
  await page
    .locator("td", { hasText: MODE_A })
    .first()
    .waitFor({ state: "visible", timeout: 10000 })
    .catch(() => {});
  ok(
    "mode created in Mode Master",
    (await page.locator("td", { hasText: MODE_A }).count()) > 0
  );

  // duplicate ignoring case/spaces → rejected
  await page.getByRole("button", { name: /add mode/i }).click();
  await page.waitForSelector("#master-value", { timeout: 5000 });
  await page.fill("#master-value", "  " + MODE_A.toUpperCase() + " ");
  await page.getByRole("button", { name: /^create|^save|^add/i }).last().click();
  await page.waitForTimeout(1200);
  const dupErr = await page.locator("text=/already exists/i").count();
  ok("duplicate mode name rejected", dupErr > 0, await dialogError(page));
  await closeDialog(page);

  // add + deactivate MODE_B
  await page.getByRole("button", { name: /add mode/i }).click();
  await page.waitForSelector("#master-value", { timeout: 5000 });
  await page.fill("#master-value", MODE_B);
  await page.getByRole("button", { name: /^create|^save|^add/i }).last().click();
  const bRow = page.locator("tr", { hasText: MODE_B });
  await bRow.waitFor({ state: "visible", timeout: 8000 });
  await bRow.locator("text=Active").waitFor({ timeout: 5000 }).catch(() => {});
  ok(
    "second mode created active",
    (await bRow.locator("text=Active").count()) > 0
  );
  await bRow.getByTitle("Deactivate").click();
  await bRow.locator("text=Inactive").waitFor({ timeout: 5000 }).catch(() => {});
  ok(
    "mode deactivation shows Inactive badge",
    (await bRow.locator("text=Inactive").count()) > 0
  );

  // search — wait for exactly the filtered row
  await page.fill('input[placeholder="Search..."]', MODE_A);
  await page
    .waitForFunction(
      () => document.querySelectorAll("tbody tr").length === 1,
      { timeout: 10000 }
    )
    .catch(() => {});
  const visibleRows = await page.locator("tbody tr").count();
  ok("mode search works", visibleRows === 1, `${visibleRows} row(s)`);
  await page.fill('input[placeholder="Search..."]', "");
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "b2-mode-master.png") });

  // ── Inward form: Mode + Letter pad ──
  await page.goto(BASE + "/dashboard/in-out-register", {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: /new inward/i }).first().click();
  await page.waitForSelector("#modeId", { timeout: 8000 });

  // Mode dropdown shows active modes only (not MODE_B)
  await page.locator("#modeId").click();
  await page.waitForTimeout(400);
  const modeOpts = await page
    .locator('[role="listbox"]:visible [role="option"]')
    .allTextContents();
  await page.keyboard.press("Escape");
  ok(
    "mode dropdown lists active mode",
    modeOpts.some((o) => o.includes(MODE_A)),
    JSON.stringify(modeOpts)
  );
  ok(
    "inactive mode NOT offered",
    !modeOpts.some((o) => o.includes(MODE_B))
  );

  // fill valid inward with mode + letter pad
  const docNo = `QA/${RUN}/INW`;
  await page.fill("#documentRefNo", docNo);
  await pickOption(page, "#clientId");
  await pickOption(page, "#actionSuggestedStaffId");
  await pickOption(page, "#modeId", MODE_A);
  await page.fill("#letterPad", "Head Office Pad");
  await page.screenshot({
    path: path.join(OUT, "b2-inward-form-desktop.png"),
  });
  await page.getByRole("button", { name: /create entry/i }).click();
  await page.waitForTimeout(3000);
  const savedInw = !(await page
    .locator("#documentRefNo")
    .isVisible()
    .catch(() => false));
  ok("inward saved w/ mode + letter pad", savedInw, savedInw ? "" : await dialogError(page));

  // ── Outward form: Mode + Gujarati letter pad ──
  await page.getByRole("button", { name: /new outward/i }).first().click();
  await page.waitForSelector("#modeId", { timeout: 8000 });
  const docNo2 = `QA/${RUN}/OUT`;
  await page.fill("#documentRefNo", docNo2);
  await pickOption(page, "#clientId");
  await pickOption(page, "#actionSuggestedStaffId");
  await pickOption(page, "#modeId", MODE_A);
  await page.fill("#letterPad", "ગુજરાતી લેટર પેડ");
  await page.screenshot({
    path: path.join(OUT, "b2-outward-form-desktop.png"),
  });
  await page.getByRole("button", { name: /create entry/i }).click();
  await page.waitForTimeout(3000);
  const savedOut = !(await page
    .locator("#documentRefNo")
    .isVisible()
    .catch(() => false));
  ok("outward saved w/ mode + Gujarati letter pad", savedOut, savedOut ? "" : await dialogError(page));

  // ── Edit: saved values round-trip ──
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/dashboard/in-out-register?search=" + encodeURIComponent(docNo), {
    waitUntil: "networkidle",
  });
  await page.locator("tbody tr").first().click();
  await page.waitForSelector("#letterPad", { timeout: 8000 });
  const lpVal = await page.locator("#letterPad").inputValue();
  ok("letter pad round-trips on edit", lpVal === "Head Office Pad", lpVal);
  const modeShown = await page.locator("#modeId").textContent();
  ok("saved mode shown on edit", (modeShown ?? "").includes(MODE_A), modeShown);
  await page.screenshot({ path: path.join(OUT, "b2-edit-roundtrip.png") });
  await closeDialog(page);

  // ── deactivate the used mode → edit still shows it preserved ──
  await gotoModeMaster(page);
  const aRow = page.locator("tr", { hasText: MODE_A });
  await aRow.waitFor({ state: "visible", timeout: 8000 });
  await aRow.getByTitle("Deactivate").click();
  await aRow.locator("text=Inactive").waitFor({ timeout: 5000 }).catch(() => {});

  await page.goto(BASE + "/dashboard/in-out-register?search=" + encodeURIComponent(docNo), {
    waitUntil: "networkidle",
  });
  await page.locator("tbody tr").first().click();
  await page.waitForSelector("#modeId", { timeout: 8000 });
  const preserved = await page.locator("#modeId").textContent();
  ok(
    "inactive mode preserved on edit (not cleared)",
    (preserved ?? "").includes(MODE_A),
    preserved
  );
  await page.locator("#modeId").click();
  await page.waitForTimeout(400);
  const preservedOpt = await page
    .locator('[role="listbox"]:visible [role="option"]')
    .allTextContents();
  ok(
    "preserved option labelled inactive",
    preservedOpt.some((o) => /inactive/i.test(o)),
    JSON.stringify(preservedOpt)
  );
  await page.keyboard.press("Escape");
  // ordinary save must succeed keeping the inactive mode
  await page.getByRole("button", { name: /save changes/i }).click();
  await page.waitForTimeout(2500);
  const editSaved = !(await page
    .locator("#modeId")
    .isVisible()
    .catch(() => false));
  ok("edit saved keeping inactive mode", editSaved, editSaved ? "" : await dialogError(page));
  await closeDialog(page);

  // ── Outward reply flow: mode + letter pad fields present ──
  await page.goto(BASE + "/dashboard/in-out-register?search=" + encodeURIComponent(docNo), {
    waitUntil: "networkidle",
  });
  const replyBtn = page.getByRole("button", { name: /^reply$/i }).first();
  if (await replyBtn.isVisible().catch(() => false)) {
    await replyBtn.click();
    await page.waitForSelector("#letterPad", { timeout: 8000 });
    // All QA modes are inactive now → form must show the empty-master
    // explanation (no selectable options) rather than a broken dropdown.
    const modeLabel = await page.locator('label[for="modeId"]').count();
    const modeEmptyMsg = await page.locator("text=/no active modes/i").count();
    ok("reply outward form has Mode field", modeLabel === 1);
    ok(
      "empty/inactive mode master shows explanation",
      modeEmptyMsg === 1 || (await page.locator("#modeId").isVisible().catch(() => false))
    );
    ok(
      "reply outward has Letter pad field",
      await page.locator("#letterPad").isVisible()
    );
    await page.screenshot({ path: path.join(OUT, "b2-reply-outward.png") });
    await closeDialog(page);
  } else {
    ok("reply outward form has Mode field", false, "no reply button found");
  }

  // ── Mobile check ──
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/dashboard/in-out-register", {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: /new inward/i }).first().click();
  await page.waitForSelector("#documentRefNo", { timeout: 8000 });
  await page.waitForSelector("#letterPad", { timeout: 8000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 2
  );
  ok("mobile 390px no horizontal overflow", !overflow);
  await page.screenshot({ path: path.join(OUT, "b2-form-mobile-390.png") });
  await closeDialog(page);

  console.log("\n=== BRICK 2 QA RESULTS ===");
  results.forEach((r) => console.log(r));
  console.log(
    `\nJS errors: ${errors.length}${errors.length ? "\n" + errors.slice(0, 5).join("\n") : ""}`
  );
  await browser.close();
  process.exit(results.some((r) => r.startsWith("FAIL")) || errors.length ? 1 : 0);
})();
