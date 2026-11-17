// Brick 3 QA — same-screen PDF preview for In-Out Register attachments.
// Disposable manual_test DB. Requires dev server on :3100.
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3100";
const OUT = path.join(__dirname, "..", "qa-shots");
fs.mkdirSync(OUT, { recursive: true });
const RUN = `B3${(Date.now() % 100000).toString(36)}`;
const PDF1 = "/tmp/qa-pdfs/Test-Letter-One.pdf";
const PDF2 = "/tmp/qa-pdfs/Second Attachment.pdf";

const results = [];
const ok = (name, pass, note = "") =>
  results.push(`${pass ? "PASS" : "FAIL"} ${name}${note ? " — " + note : ""}`);

const pickOption = async (page, sel, match) => {
  await page.locator(sel).click();
  const list = page.locator('[role="listbox"]:visible');
  await list.waitFor({ state: "visible", timeout: 5000 });
  const opt = match
    ? list.getByRole("option", { name: match })
    : list.getByRole("option").first();
  await opt.click();
};

const dialog = (page) => page.locator('[role="dialog"]:visible').last();

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 160));
  });

  // ── login ──
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"], #email', "admin@saec.com");
  await page.fill('input[type="password"], #password', "QaTest123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });
  ok("login", true);

  // ── new inward with PDF ──
  await page.goto(BASE + "/dashboard/in-out-register", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /new inward/i }).click();
  const dlg = dialog(page);
  await dlg.waitFor({ timeout: 8000 });

  await dlg.locator('input[name="documentRefNo"], #documentRefNo').fill(`DOC-${RUN}-A`);
  await pickOption(page, "#actionSuggestedStaffId");
  await pickOption(page, "#inwardType", /action required/i);
  await dlg.locator('textarea[name="details"], #details').fill(`Brick3 QA details ${RUN}`);

  // attach PDF 1 via the hidden file input inside the form dialog
  await dlg.locator('input[type="file"]').setInputFiles(PDF1);
  const docRow = dlg.locator("div").filter({ hasText: "Test-Letter-One.pdf" }).last();
  await dlg.getByText("Test-Letter-One.pdf").first().waitFor({ timeout: 10000 });
  ok("upload before save shows filename", true);

  // ── view before save ──
  await dlg.getByRole("button", { name: /view pdf/i }).first().click();
  const preview = page.locator('[role="dialog"]:visible').last();
  await preview.waitFor({ timeout: 8000 });
  const frame = preview.locator('iframe[src^="/api/in-out-documents"]');
  await frame.waitFor({ state: "visible", timeout: 15000 });
  ok("same-screen preview opens (unsaved)", await frame.isVisible());

  const frameSrc = await frame.getAttribute("src");
  ok("preview uses authenticated endpoint", frameSrc.includes("/api/in-out-documents?path="));

  const title = await preview.getByText("Test-Letter-One.pdf").first().textContent().catch(() => "");
  ok("preview shows filename", title.includes("Test-Letter-One.pdf"));

  // unsaved field intact while preview open + after close
  await page.screenshot({ path: path.join(OUT, "b3-pdf-viewer-desktop.png") });
  await preview.getByRole("button", { name: /^close$/i }).first().click();
  await preview.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  ok("preview closed", !(await frame.isVisible().catch(() => false)));
  const detailsAfter = await dlg.locator('textarea[name="details"], #details').inputValue();
  ok("unsaved fields survive preview open/close", detailsAfter.includes(RUN));

  // ── attach second PDF → multiple attachments ──
  await dlg.locator('input[type="file"]').setInputFiles(PDF2);
  await dlg.getByText("Second_Attachment.pdf").first().waitFor({ timeout: 10000 });
  const rows = await dlg.getByRole("button", { name: /view pdf/i }).count();
  ok("multiple attachments each have View PDF", rows === 2, `rows=${rows}`);

  // open second attachment's preview → correct doc
  await dlg.getByRole("button", { name: /view pdf/i }).nth(1).click();
  const preview2 = page.locator('[role="dialog"]:visible').last();
  const frame2 = preview2.locator('iframe[src^="/api/in-out-documents"]');
  await frame2.waitFor({ state: "visible", timeout: 15000 });
  const title2 = await preview2.getByText("Second_Attachment.pdf").first().textContent().catch(() => "");
  ok("second attachment opens correct document", title2.includes("Second_Attachment.pdf"));
  await preview2.getByRole("button", { name: /^close$/i }).first().click();

  // ── save ──
  await dlg.getByRole("button", { name: /create entry/i }).click();
  await page.waitForTimeout(1500);
  ok("saved with attachments", !(await dlg.isVisible().catch(() => false)));

  // ── reopen → view saved PDF ──
  const row = page.locator("tr").filter({ hasText: `DOC-${RUN}-A` }).first();
  await row.getByRole("button", { name: /edit/i }).click();
  const dlg2 = dialog(page);
  await dlg2.waitFor({ timeout: 8000 });
  await dlg2.getByRole("button", { name: /view pdf/i }).first().click();
  const preview3 = page.locator('[role="dialog"]:visible').last();
  const frame3 = preview3.locator('iframe[src^="/api/in-out-documents"]');
  await frame3.waitFor({ state: "visible", timeout: 15000 });
  ok("saved PDF viewable after reopen", await frame3.isVisible());
  await preview3.getByRole("button", { name: /^close$/i }).first().click();
  await preview3.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});

  // non-destructive: second attachment still listed
  const btnCount = await dlg2.getByRole("button", { name: /view pdf|download/i }).count();
  ok("both attachments preserved after viewing", btnCount === 4, `view+dl btns=${btnCount}`);

  // ── refresh persistence ──
  await dlg2.getByRole("button", { name: /^cancel$/i }).click();
  await page.reload({ waitUntil: "networkidle" });
  const row2 = page.locator("tr").filter({ hasText: `DOC-${RUN}-A` }).first();
  await row2.getByRole("button", { name: /edit/i }).click();
  const dlg3 = dialog(page);
  await dlg3.waitFor({ timeout: 8000 });
  await dlg3.getByRole("button", { name: /view pdf/i }).first().click();
  const preview4 = page.locator('[role="dialog"]:visible').last();
  await preview4.locator('iframe[src^="/api/in-out-documents"]').waitFor({ state: "visible", timeout: 15000 });
  ok("preview works after browser refresh", true);
  await preview4.getByRole("button", { name: /^close$/i }).first().click();
  await dlg3.getByRole("button", { name: /^cancel$/i }).click();

  // ── mobile layout ──
  await page.setViewportSize({ width: 390, height: 844 });
  const row3 = page.locator("tr").filter({ hasText: `DOC-${RUN}-A` }).first();
  await row3.getByRole("button", { name: /edit/i }).click();
  const dlgM = dialog(page);
  await dlgM.waitFor({ timeout: 8000 });
  await dlgM.getByRole("button", { name: /view pdf/i }).first().click();
  const previewM = page.locator('[role="dialog"]:visible').last();
  await previewM.locator('iframe[src^="/api/in-out-documents"]').waitFor({ state: "visible", timeout: 15000 });
  const mBox = await previewM.boundingBox();
  ok("mobile preview fits viewport", mBox && mBox.width <= 390 && mBox.x >= -1,
    `w=${mBox && mBox.width}`);
  await page.screenshot({ path: path.join(OUT, "b3-pdf-viewer-mobile.png") });
  await previewM.getByRole("button", { name: /^close$/i }).first().click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  ok("no page-level horizontal overflow (mobile)", !overflow);
  await page.setViewportSize({ width: 1440, height: 900 });
  await dlgM.getByRole("button", { name: /^cancel$/i }).click().catch(() => {});

  // ── outward form supports preview ──
  await page.getByRole("button", { name: /new outward/i }).click();
  const dlgO = dialog(page);
  await dlgO.waitFor({ timeout: 8000 });
  await dlgO.locator('input[name="documentRefNo"], #documentRefNo').fill(`DOC-${RUN}-B`);
  await pickOption(page, "#actionSuggestedStaffId");
  await dlgO.locator('input[type="file"]').setInputFiles(PDF1);
  await dlgO.getByRole("button", { name: /view pdf/i }).waitFor({ timeout: 10000 });
  await dlgO.getByRole("button", { name: /view pdf/i }).click();
  const previewO = page.locator('[role="dialog"]:visible').last();
  await previewO.locator('iframe[src^="/api/in-out-documents"]').waitFor({ state: "visible", timeout: 15000 });
  ok("outward form supports same-screen preview", true);
  await previewO.getByRole("button", { name: /^close$/i }).first().click();
  await dlgO.getByRole("button", { name: /create entry/i }).click();
  await page.waitForTimeout(1500);

  // ── endpoint security checks (via page fetch to reuse session) ──
  // A linked doc pointing at a file absent on disk → true 404 (authz passes first).
  const { execSync } = require("child_process");
  execSync(
    `/opt/homebrew/opt/postgresql@17/bin/psql -d saec_erp_manual_test -c "INSERT INTO \\"InOutRegisterDocument\\" (id, \\"inOutRegisterId\\", path, \\"createdAt\\") SELECT gen_random_uuid()::text, id, 'inout-priv/definitely-missing.pdf', NOW() FROM \\"InOutRegister\\" WHERE \\"documentRefNo\\"='DOC-${RUN}-A'"`
  );

  const apiChecks = await page.evaluate(async () => {
    const r = {};
    const t = await fetch("/api/in-out-documents?path=" + encodeURIComponent("inout-priv/../secret.pdf"));
    r.traversal = t.status;
    const m = await fetch("/api/in-out-documents?path=" + encodeURIComponent("inout-priv/definitely-missing.pdf"));
    r.missing = m.status;
    r.missingMsg = (await m.json()).error || "";
    const u = await fetch("/api/in-out-documents?path=" + encodeURIComponent("inout-priv/someone-elses-file.pdf"));
    r.unlinked = u.status;
    const arb = await fetch("/api/in-out-documents?path=" + encodeURIComponent("/etc/passwd"));
    r.arbitrary = arb.status;
    const x = await fetch("/api/in-out-documents?path=" + encodeURIComponent("../../../../package.json"));
    r.relative = x.status;
    return r;
  });
  ok("path traversal rejected (400)", apiChecks.traversal === 400, `got ${apiChecks.traversal}`);
  ok("arbitrary filesystem read rejected (400)", apiChecks.arbitrary === 400 && apiChecks.relative === 400,
    `/etc/passwd=${apiChecks.arbitrary} ../=${apiChecks.relative}`);
  ok("missing file → helpful 404", apiChecks.missing === 404 && /could not be found/i.test(apiChecks.missingMsg),
    `${apiChecks.missing} ${apiChecks.missingMsg}`);
  ok("unlinked private path → 403 (not a file browser)", apiChecks.unlinked === 403, `got ${apiChecks.unlinked}`);

  console.log("\n" + results.join("\n"));
  console.log(`\nJS errors: ${errors.length}`);
  errors.slice(0, 6).forEach((e) => console.log("  " + e));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log("\n" + results.join("\n"));
  console.error("QA crashed:", e);
  process.exit(1);
});
