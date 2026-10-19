// QA browser audit — uses installed Playwright + system Chrome.
// Logs into localhost:3000 (saec_erp_manual_test DB), visits every
// module page, and reports console errors, raw-ID/[object Object]/
// undefined leaks, horizontal overflow, and saves screenshots.
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const OUT = path.join(__dirname, "..", "qa-shots");
fs.mkdirSync(OUT, { recursive: true });

const MODULES = [
  ["dashboard", "/dashboard"],
  ["fund-flow", "/dashboard/fund-flow"],
  ["due-bills", "/dashboard/due-bills"],
  ["wip", "/dashboard/wip"],
  ["payment-schedules", "/dashboard/payment-schedules"],
  ["tasks", "/dashboard/tasks"],
  ["contractors", "/dashboard/contractors"],
  ["tenders", "/dashboard/tenders"],
  ["tada-bills", "/dashboard/tada-bills"],
  ["vehicle-log-book", "/dashboard/vehicle-log-book"],
  ["property", "/dashboard/property"],
  ["in-out-register", "/dashboard/in-out-register"],
  ["employee", "/dashboard/employee"],
  ["masters", "/dashboard/masters"],
  ["reports", "/dashboard/reports"],
  ["settings", "/dashboard/settings"],
];

// raw cuid / object-id-ish strings visible to users
const CUID_RE = /\bcm[a-z0-9]{20,}\b|\bc[a-z0-9]{24}\b/g;
const BAD_TOKENS = ["[object Object]", "NaN", "Invalid Date"];

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + String(e).slice(0, 200)));

  // ── login ──
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"], input[name="email"], #email', "admin@saec.com");
  await page.fill('input[type="password"], input[name="password"], #password', process.env.QA_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|\/$/, { timeout: 15000 }).catch(() => {});
  console.log("login landed:", page.url());

  const report = [];
  for (const [name, route] of MODULES) {
    const issues = [];
    const errorsBefore = consoleErrors.length;
    try {
      const resp = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 20000 });
      const status = resp?.status();
      if (!status || status >= 400) issues.push(`HTTP ${status}`);
      await page.waitForTimeout(1200);

      const text = await page.evaluate(() => document.body.innerText);
      const cuids = [...new Set(text.match(CUID_RE) || [])].slice(0, 5);
      if (cuids.length) issues.push(`raw IDs visible: ${cuids.join(",")}`);
      for (const tok of BAD_TOKENS) {
        if (text.includes(tok)) issues.push(`visible "${tok}"`);
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 4
      );
      if (overflow) issues.push("horizontal page overflow");
      const newErr = consoleErrors.length - errorsBefore;
      if (newErr) issues.push(`${newErr} console errors`);
      await page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: false });
      report.push({ name, route, status, issues });
      console.log(`${name.padEnd(20)} ${status} ${issues.length ? "ISSUES: " + issues.join(" | ") : "ok"}`);
    } catch (e) {
      report.push({ name, route, status: "ERR", issues: [String(e).slice(0, 160)] });
      console.log(`${name.padEnd(20)} ERROR ${String(e).slice(0, 160)}`);
    }
  }

  console.log("\n=== console errors (unique) ===");
  [...new Set(consoleErrors)].slice(0, 15).forEach((e) => console.log(" -", e));
  fs.writeFileSync(path.join(OUT, "audit.json"), JSON.stringify(report, null, 2));
  await browser.close();
})();
