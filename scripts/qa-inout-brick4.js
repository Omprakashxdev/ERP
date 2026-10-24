// Brick 4 QA — Gujarati CSV/XLSX export verification. Disposable manual_test DB.
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const BASE = "http://localhost:3100";
const OUT = path.join(__dirname, "..", "qa-shots");
const DL = "/tmp/qa-b4-downloads";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(DL, { recursive: true });
const RUN = `B4${(Date.now() % 100000).toString(36)}`;

const GUJ = {
  details: "ગુજરાતી દસ્તાવેજ",
  letterPad: "Letter pad - અમદાવાદ",
  receivedBy: "આવક જાવક રજિસ્ટર",
  department: "કાર્યવાહી જરૂરી",
};

const results = [];
const ok = (n, p, note = "") =>
  results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);

const pickOption = async (page, sel, match) => {
  await page.locator(sel).click();
  const list = page.locator('[role="listbox"]:visible');
  await list.waitFor({ state: "visible", timeout: 5000 });
  const opt = match
    ? list.getByRole("option", { name: match })
    : list.getByRole("option").first();
  await opt.click();
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"], #email', "admin@saec.com");
  await page.fill('input[type="password"], #password', "QaTest123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });

  // ── create an inward entry with Gujarati content ──
  await page.goto(BASE + "/dashboard/in-out-register", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /new inward/i }).click();
  const dlg = page.locator('[role="dialog"]:visible').last();
  await dlg.waitFor({ timeout: 8000 });
  await dlg.locator('input[name="documentRefNo"], #documentRefNo').fill(`GUJ-${RUN}`);
  await pickOption(page, "#actionSuggestedStaffId");
  await pickOption(page, "#inwardType", /action required/i);
  await pickOption(page, "#clientId");
  await dlg.locator('textarea[name="details"], #details').fill(GUJ.details);
  await dlg.locator('#letterPad, input[name="letterPad"]').fill(GUJ.letterPad);
  await dlg.locator('#receivedByPersonName, input[name="receivedByPersonName"]').fill(GUJ.receivedBy);
  await dlg.locator('#department, input[name="department"]').fill(GUJ.department);
  await dlg.getByRole("button", { name: /create entry/i }).click();
  await page.waitForTimeout(1800);
  ok("Gujarati entry created", !(await dlg.isVisible().catch(() => false)));

  // ── export CSV ──
  await page.goto(BASE + "/dashboard/settings", { waitUntil: "networkidle" });
  const exportSection = page.locator("text=Export Data").first();
  await exportSection.waitFor({ timeout: 8000 });

  const moduleSel = page.locator('[role="combobox"]').first();
  await moduleSel.click();
  await page.getByRole("option", { name: "In-Out Register" }).click();

  // format select → CSV
  const formatSel = page.locator('[role="combobox"]').nth(1);
  await formatSel.click();
  await page.getByRole("option", { name: "CSV (.csv)" }).click();

  const [csvDl] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("button", { name: /^export$/i }).click(),
  ]);
  const csvPath = path.join(DL, csvDl.suggestedFilename());
  await csvDl.saveAs(csvPath);
  const csvBytes = fs.readFileSync(csvPath);
  ok("CSV begins with UTF-8 BOM EF BB BF",
    csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf,
    `first3=${[...csvBytes.slice(0, 3)].map((b) => b.toString(16)).join(" ")}`);
  const bomCount = csvBytes.includes(Buffer.from([0xef, 0xbb, 0xbf]), 3) ? 2 : 1;
  ok("BOM appears exactly once", bomCount === 1);
  const csvText = csvBytes.toString("utf8");
  ok("CSV contains Gujarati letterPad", csvText.includes(GUJ.letterPad));
  ok("CSV contains Gujarati details", csvText.includes(GUJ.details));
  ok("CSV contains doc ref", csvText.includes(`GUJ-${RUN}`));
  ok("CSV has no replacement chars", !csvText.includes("�"));
  await page.screenshot({ path: path.join(OUT, "b4-export-panel.png"), fullPage: false });

  // ── export XLSX ──
  await formatSel.click();
  await page.getByRole("option", { name: "Excel (.xlsx)" }).click();
  const [xlsxDl] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("button", { name: /^export$/i }).click(),
  ]);
  const xlsxPath = path.join(DL, xlsxDl.suggestedFilename());
  await xlsxDl.saveAs(xlsxPath);
  const xlsxBytes = fs.readFileSync(xlsxPath);
  ok("XLSX is a valid zip workbook", xlsxBytes[0] === 0x50 && xlsxBytes[1] === 0x4b);
  const wb = XLSX.read(xlsxBytes, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { raw: true });
  const gujRow = rows.find((r) => r.documentRefNo === `GUJ-${RUN}`);
  ok("XLSX row found", !!gujRow);
  ok("XLSX preserves Gujarati details", gujRow?.details === GUJ.details, gujRow?.details);
  ok("XLSX preserves letterPad", gujRow?.letterPad === GUJ.letterPad, gujRow?.letterPad);
  ok("XLSX preserves mode/dept Gujarati", gujRow?.department === GUJ.department, gujRow?.department);

  // ── first header clean after BOM strip (what parseCsv guarantees) ──
  const firstHeader = csvText.replace(/^\uFEFF/, "").split("\n")[0].split(",")[0];
  ok("first header is clean after BOM strip", firstHeader === "id", firstHeader);

  console.log("\n" + results.join("\n"));
  console.log(`\nDownloads: ${csvPath}\n           ${xlsxPath}`);
  console.log(`JS errors: ${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log("  " + e));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log("\n" + results.join("\n"));
  console.error("QA crashed:", e);
  process.exit(1);
});
