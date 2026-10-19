// Phase 2D acceptance: start date + attachments, real roles.
const { chromium } = require("@playwright/test");
const BASE = "http://localhost:3000";
const PW = process.env.QA_PASSWORD;

async function login(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await ctx.newPage();
  await p.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 90000 });
  await p.waitForSelector("#email", { timeout: 60000 });
  await p.waitForTimeout(1200);
  await p.fill("#email", email);
  await p.fill("#password", PW);
  await p.click("button[type=submit]");
  await p.waitForURL(/dashboard/, { timeout: 40000 });
  return { ctx, p };
}

async function pick(p, placeholder, optionText) {
  await p.locator(`button:has-text("${placeholder}")`).first().click();
  await p.waitForTimeout(400);
  await p.locator(`[role=option]:has-text("${optionText}")`).filter({ visible: true }).first().click();
  await p.waitForTimeout(300);
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const TITLE = "P2D-" + Date.now().toString(36).toUpperCase();
  const results = [];
  const ok = (n, pass, extra = "") => console.log(`${pass ? "PASS" : "FAIL"} ${n} ${extra}`);

  // 1. Manager creates task WITH Start Date
  let { ctx, p } = await login(browser, "manager@saec.com");
  await p.goto(BASE + "/dashboard/tasks", { waitUntil: "networkidle", timeout: 60000 });
  await p.getByText("New Task").first().click();
  await p.waitForTimeout(1000);
  await p.locator('[role=dialog] input').first().fill(TITLE);
  await pick(p, "Select staff", "Foram Shah");
  await pick(p, "No reviewer", "Jitendra Patel");
  const dateInputs = p.locator('[role=dialog] input[type=date]');
  await dateInputs.nth(0).fill("2026-10-20"); // start
  await dateInputs.nth(1).fill("2026-11-05"); // due
  await p.getByRole("button", { name: /create task/i }).click();
  await p.waitForTimeout(2500);
  const created = (await p.evaluate(() => document.body.innerText)).includes(TITLE);
  ok("task created with start+due dates", created);
  await ctx.close();

  // 2. Foram opens the task — edit form shows Start Date + attachments; upload file
  ({ ctx, p } = await login(browser, "foram@saec.com"));
  await p.goto(BASE + "/dashboard/tasks", { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(2000);
  const row = p.locator("tr", { hasText: TITLE }).first();
  await row.waitFor({ state: "visible", timeout: 30000 });
  await row.click(); // row click opens the edit dialog
  await p.waitForSelector('[role=dialog]', { timeout: 15000 });
  await p.waitForTimeout(1200);
  let dlg = await p.locator('[role=dialog]').innerText();
  ok("edit dialog shows Start Date + Attachments", dlg.includes("Start Date") && dlg.includes("Attachments"), `| ${dlg.replace(/\n/g," ").slice(0,160)}`);
  const startVal = await p.locator('[role=dialog] input[type=date]').nth(0).inputValue();
  ok("start date persisted in edit form", startVal === "2026-10-20", `| got ${startVal}`);
  // upload a file
  const fileInput = p.locator('[role=dialog] input[type=file]');
  await fileInput.setInputFiles({ name: "test-doc.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
  await p.waitForTimeout(2500);
  dlg = await p.locator('[role=dialog]').innerText();
  const uploaded = dlg.includes("test-doc.pdf");
  ok("assignee uploads attachment", uploaded);
  // capture the attachment id for the unauthorized check
  let attId = null;
  if (uploaded) {
    const href = await p.locator('[role=dialog] a[href*="/api/task-files/"]').first().getAttribute("href");
    attId = href ? href.split("/").pop() : null;
  }
  await ctx.close();

  // 3. Reviewer (Jitendra) can download the same file
  ({ ctx, p } = await login(browser, "jitendra@saec.com"));
  const dl = await p.request.get(`${BASE}/api/task-files/${attId}`).catch(() => null);
  ok("reviewer downloads attachment", dl && dl.status() === 200, dl ? `| status ${dl.status()}` : "| req failed");
  await ctx.close();

  // 4. Unrelated staff (Neha) is DENIED — even with the exact attachment id
  ({ ctx, p } = await login(browser, "neha@saec.com"));
  const dlN = await p.request.get(`${BASE}/api/task-files/${attId}`).catch(() => null);
  ok("unrelated staff denied file access", dlN && dlN.status() === 403, dlN ? `| status ${dlN.status()}` : "| req failed");
  await ctx.close();

  // 5. Anonymous access denied
  const anon = await browser.newContext();
  const pA = await anon.newPage();
  const dlA = await pA.request.get(`${BASE}/api/task-files/${attId}`).catch(() => null);
  ok("anonymous denied file access", dlA && dlA.status() === 401, dlA ? `| status ${dlA.status()}` : "| req failed");
  await anon.close();

  await browser.close();
})();
