const { chromium } = require("@playwright/test");
const path = require("path");
(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await page.goto("https://erp.adelphostech.com/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"], input[name="email"], #email', "qa-admin@saec-qa.local");
  await page.fill('input[type="password"], input[name="password"], #password', process.env.QA_ADMIN_PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  await page.goto("https://erp.adelphostech.com/dashboard/progress-app/sites/cmvs41k8v0009s1zzpxs8dm2j", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('h1:has-text("QA")', { timeout: 20000 });
  await page.click('button:has-text("Edit")');
  await page.waitForSelector("text=Site cover image", { timeout: 8000 });
  await page.locator('input[type="file"][accept*="webp"]').setInputFiles(
    path.join("/Users/shivang/erp-progress/qa-shots/live-rel2/cover-upload.png"));
  await page.waitForSelector('img[alt="New cover preview"]', { timeout: 8000 });
  await page.click('button[type="submit"]:has-text("Save")');
  await page.waitForTimeout(3000);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: "/Users/shivang/erp-progress/qa-shots/live-rel2/07-cover-replaced.png", fullPage: true });
  console.log("cover replaced; header img visible:", await page.locator('img[alt*="cover"]').first().isVisible().catch(() => false));
  await browser.close();
})();
