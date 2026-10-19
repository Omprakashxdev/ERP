// Phase 2C acceptance: real-role task workflow E2E on isolated DB.
const { chromium } = require("@playwright/test");
const BASE = "http://localhost:3000";
const PW = process.env.QA_PASSWORD;

async function login(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await ctx.newPage();
  await p.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 90000 });
  await p.waitForSelector("#email", { timeout: 60000 });
  await p.waitForTimeout(1500);
  await p.fill("#email", email);
  await p.fill("#password", PW);
  await p.click("button[type=submit]");
  await p.waitForURL(/dashboard/, { timeout: 30000 });
  return { ctx, p };
}

async function pick(p, placeholder, optionText) {
  await p.locator(`button:has-text("${placeholder}")`).first().click();
  await p.waitForTimeout(500);
  await p
    .locator(`[role=option]:has-text("${optionText}")`)
    .filter({ visible: true })
    .first()
    .click();
  await p.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const TITLE = "WF-ACC-" + Date.now().toString(36).toUpperCase();
  const results = [];
  const ok = (name, pass, extra = "") =>
    results.push({ name, pass, extra }) && console.log(`${pass ? "PASS" : "FAIL"} ${name} ${extra}`);

  // ── 1. Manager creates task: assignee Foram, reviewer Jitendra ──
  let { ctx, p } = await login(browser, "manager@saec.com");
  await p.goto(BASE + "/dashboard/tasks", { waitUntil: "networkidle", timeout: 60000 });
  await p.getByText("New Task").first().click();
  await p.waitForTimeout(1200);
  await p.locator('[role=dialog] input').first().fill(TITLE);
  await pick(p, "Select staff", "Foram Shah");
  await pick(p, "No reviewer", "Jitendra Patel");
  await p.getByRole("button", { name: /create task|create/i }).click();
  await p.waitForTimeout(2500);
  const created = (await p.evaluate(() => document.body.innerText)).includes(TITLE);
  ok("manager creates task assigned to A, reviewer B", created);
  await ctx.close();

  // ── 2. Employee A (Foram, STAFF) accepts + progress + submit ──
  ({ ctx, p } = await login(browser, "foram@saec.com"));
  await p.goto(BASE + "/dashboard/tasks", { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(2000);
  const rowA = p.locator("tr", { hasText: TITLE }).first();
  await rowA.locator('button[title="Change status"]').click();
  await p.waitForTimeout(900);
  let dlgText = await p.locator('[role=dialog]').innerText();
  ok("A sees 'Accept task' on own OPEN task", dlgText.includes("Accept task"), `| dlg: ${dlgText.replace(/\n/g," ").slice(0,120)}`);
  await p.getByRole("button", { name: "Accept task" }).click();
  await p.waitForTimeout(2000);
  // progress update
  await rowA.locator('button[title="Change status"]').click();
  await p.waitForTimeout(900);
  await p.getByRole("button", { name: "Update progress" }).click();
  await p.waitForTimeout(500);
  await p.locator('input[type=range]').fill("60");
  await p.fill('[role=dialog] input[placeholder="What was done?"]', "half done");
  await p.getByRole("button", { name: "Save progress" }).click();
  await p.waitForTimeout(2000);
  // submit for review
  await rowA.locator('button[title="Change status"]').click();
  await p.waitForTimeout(900);
  await p.getByRole("button", { name: "Submit for review" }).click();
  await p.waitForTimeout(2000);
  const txtA = await p.evaluate(() => document.body.innerText);
  const rowTxt = await rowA.innerText();
  ok("A submitted — status pending review", /pending review/i.test(rowTxt) || /pending review/i.test(txtA));
  // negative: A must NOT see approve on own task
  await rowA.locator('button[title="Change status"]').click().catch(() => {});
  await p.waitForTimeout(900);
  dlgText = await p.locator('[role=dialog]').innerText().catch(() => "");
  ok("A cannot approve own submitted task (no Approve button)", !/Approve/.test(dlgText), `| dlg: ${dlgText.replace(/\n/g," ").slice(0,140)}`);
  await p.keyboard.press("Escape");
  await ctx.close();

  // ── 3. Reviewer B (Jitendra, STAFF) requests rework ──
  ({ ctx, p } = await login(browser, "jitendra@saec.com"));
  await p.goto(BASE + "/dashboard/tasks", { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(2000);
  const rowB = p.locator("tr", { hasText: TITLE }).first();
  await rowB.locator('button[title="Change status"]').click();
  await p.waitForTimeout(900);
  dlgText = await p.locator('[role=dialog]').innerText();
  ok("B sees review actions", dlgText.includes("Approve") && dlgText.includes("Request changes"), `| ${dlgText.replace(/\n/g," ").slice(0,140)}`);
  await p.fill('[role=dialog] textarea', "Please attach the missing figures");
  await p.getByRole("button", { name: "Request changes" }).click();
  await p.waitForTimeout(2000);
  const rowTxtB = await rowB.innerText();
  ok("B sent rework — back to in progress", /in progress/i.test(rowTxtB));
  // negative: B cannot touch an unrelated task's approve path — try the other staff member's task if present
  await ctx.close();

  // ── 4. A resubmits, B approves ──
  ({ ctx, p } = await login(browser, "foram@saec.com"));
  await p.goto(BASE + "/dashboard/tasks", { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(2000);
  const rowA2 = p.locator("tr", { hasText: TITLE }).first();
  await rowA2.locator('button[title="Change status"]').click();
  await p.waitForTimeout(900);
  await p.getByRole("button", { name: "Submit for review" }).click();
  await p.waitForTimeout(2000);
  await ctx.close();

  ({ ctx, p } = await login(browser, "jitendra@saec.com"));
  await p.goto(BASE + "/dashboard/tasks", { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(2000);
  const rowB2 = p.locator("tr", { hasText: TITLE }).first();
  await rowB2.locator('button[title="Change status"]').click();
  await p.waitForTimeout(900);
  await p.getByRole("button", { name: "Approve" }).click();
  await p.waitForTimeout(2000);
  const rowTxtB2 = await rowB2.innerText();
  ok("B approved — COMPLETED", /completed/i.test(rowTxtB2));
  await p.screenshot({ path: "qa-shots/task-workflow-completed.png" });
  await ctx.close();

  console.log("\n" + JSON.stringify(results.map(r => `${r.pass ? "✓" : "✗"} ${r.name}`).join("\n")));
  await browser.close();
})();
