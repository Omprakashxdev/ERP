// Brick 3 — legacy /uploads/ path serving + content-type + restart persistence.
const { chromium } = require("@playwright/test");
const path = require("path");
const fs = require("fs");
const BASE = "http://localhost:3100";
const OUT = path.join(__dirname, "..", "qa-shots");
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const results = [];
  const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"], #email', "admin@saec.com");
  await page.fill('input[type="password"], #password', "QaTest123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });

  // content-type through the authenticated endpoint (session cookie reused)
  const resp = await ctx.request.get(
    BASE + "/api/in-out-documents?path=" + encodeURIComponent("/uploads/in-out-register-doc/1700000000000_legacy-letter.pdf")
  );
  ok("legacy /uploads/ path served (200)", resp.status() === 200, `status=${resp.status()}`);
  ok("correct PDF Content-Type", resp.headers()["content-type"] === "application/pdf",
    resp.headers()["content-type"]);
  ok("inline disposition", (resp.headers()["content-disposition"] || "").startsWith("inline"),
    resp.headers()["content-disposition"]);

  const meta = await ctx.request.get(
    BASE + "/api/in-out-documents?meta=1&path=" + encodeURIComponent("/uploads/in-out-register-doc/1700000000000_legacy-letter.pdf")
  );
  const metaBody = await meta.json();
  ok("legacy meta returns display filename", metaBody.filename === "legacy-letter.pdf",
    JSON.stringify(metaBody));

  // open the seeded entry and preview the legacy attachment on-screen
  const { execSync } = require("child_process");
  const seededRef = execSync(
    `/opt/homebrew/opt/postgresql@17/bin/psql -d saec_erp_manual_test -tAc "SELECT r.\\"documentRefNo\\" FROM \\"InOutRegisterDocument\\" d JOIN \\"InOutRegister\\" r ON r.id=d.\\"inOutRegisterId\\" WHERE d.path LIKE '%legacy%' LIMIT 1"`
  ).toString().trim();
  console.log("  seeded entry:", seededRef);
  await page.goto(BASE + "/dashboard/in-out-register", { waitUntil: "networkidle" });
  const row = page.locator("tr").filter({ hasText: seededRef }).first();
  await row.getByRole("button", { name: /edit/i }).click();
  const dlg = page.locator('[role="dialog"]:visible').last();
  await dlg.waitFor({ timeout: 8000 });
  await dlg.getByText("legacy-letter.pdf").waitFor({ timeout: 8000 });
  ok("legacy attachment listed in edit form", true);
  const viewBtns = await dlg.getByRole("button", { name: /view pdf/i }).count();
  await dlg.getByRole("button", { name: /view pdf/i }).nth(viewBtns - 1).click();
  const preview = page.locator('[role="dialog"]:visible').last();
  await preview.locator('iframe[src^="/api/in-out-documents"]').waitFor({ state: "visible", timeout: 15000 });
  const t = await preview.getByText("legacy-letter.pdf").first().textContent().catch(() => "");
  ok("legacy attachment opens in same-screen viewer", t.includes("legacy-letter.pdf"));
  await page.screenshot({ path: path.join(OUT, "b3-legacy-doc-viewer.png") });
  await preview.getByRole("button", { name: /^close$/i }).first().click();
  await preview.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  await dlg.getByRole("button", { name: /^cancel$/i }).click();
  await dlg.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});

  // non-PDF attachment → View opens endpoint link in new tab
  await page.getByRole("button", { name: /new inward/i }).click();
  const dlgN = page.locator('[role="dialog"]:visible').last();
  await dlgN.waitFor({ timeout: 8000 });
  fs.writeFileSync("/tmp/qa-pdfs/notes.docx", "fake docx for extension check");
  await dlgN.locator('input[type="file"]').setInputFiles("/tmp/qa-pdfs/notes.docx");
  await dlgN.getByText("notes.docx").waitFor({ timeout: 10000 });
  const viewHref = await dlgN
    .locator('a[href^="/api/in-out-documents?path="]:not([href*="download"])')
    .first()
    .getAttribute("href");
  ok("non-PDF keeps View (new-tab endpoint link)",
    viewHref && viewHref.startsWith("/api/in-out-documents?path="), viewHref || "");
  const dlHref = await dlgN.locator('a[href*="download=1"]').first().getAttribute("href");
  ok("non-PDF Download link present", !!dlHref);
  await dlgN.getByRole("button", { name: /^cancel$/i }).click();

  console.log("\n" + results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("QA crashed:", e);
  process.exit(1);
});
