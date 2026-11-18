// Progress App — Checklists + Progress QA (Brick 3).
// Runs against the disposable saec_erp_progress_dev DB on localhost:3100.
// Verifies: template CRUD + reorder, room checklist assignment (snapshot),
// read-only activity statuses, real progress bars at every level,
// template-edit isolation, checklist replace impact preview,
// unconfigured-room warnings, staff read-only, responsive layouts.
const { chromium } = require("@playwright/test");
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3100";
const OUT = path.join(__dirname, "..", "qa-shots");
fs.mkdirSync(OUT, { recursive: true });

const prisma = new PrismaClient();
const RUN = `C${(Date.now() % 100000).toString(36).toUpperCase()}`;

const results = [];
const ok = (name, pass, note = "") =>
  results.push(`${pass ? "PASS" : "FAIL"} ${name}${note ? " — " + note : ""}`);

async function login(page, email, password) {
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"], #email', email);
  await page.fill('input[type="password"], #password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });
}

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

  // Clean prior QA data — this DB is disposable and only holds Progress App
  // test rows. FK-safe order: history → activities → checklists → items →
  // templates → rooms → flats → floors → wings → sites.
  await prisma.progressActivityHistory.deleteMany();
  await prisma.progressRoomActivity.deleteMany();
  await prisma.progressRoomChecklist.deleteMany();
  await prisma.progressActivityTemplateItem.deleteMany();
  await prisma.progressActivityTemplate.deleteMany();
  await prisma.progressRoom.deleteMany();
  await prisma.progressFlat.deleteMany();
  await prisma.progressFloor.deleteMany();
  await prisma.progressWing.deleteMany();
  await prisma.progressSite.deleteMany();

  // ── Seed hierarchy via Prisma (UI hierarchy tested in Brick 2 QA) ──
  const admin = await prisma.user.findUnique({
    where: { email: "admin@saec.com" },
    select: { id: true },
  });
  const site = await prisma.progressSite.create({
    data: {
      siteCode: `CK-${RUN}`,
      siteName: `Checklist QA ${RUN}`,
      status: "ACTIVE",
      createdById: admin.id,
    },
  });
  const wing = await prisma.progressWing.create({
    data: { siteId: site.id, code: "W-A", name: "Wing Alpha" },
  });
  const floor = await prisma.progressFloor.create({
    data: { wingId: wing.id, floorIdentifier: "1", displayName: "First Floor" },
  });
  const flat = await prisma.progressFlat.create({
    data: { floorId: floor.id, flatNumber: "101", flatType: "2BHK" },
  });
  const room1 = await prisma.progressRoom.create({
    data: { flatId: flat.id, roomName: "Living Room", roomType: "Living" },
  });
  const room2 = await prisma.progressRoom.create({
    data: { flatId: flat.id, roomName: "Store Room", roomType: "Store" },
  });
  ok("hierarchy seeded", true);

  // ── Login + templates nav ──
  await login(page, "admin@saec.com", "ProgressDev123!");
  ok("admin login", true);
  await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
  const tplNav = page.locator(
    'nav a[href="/dashboard/progress-app/templates"]'
  );
  ok(
    "sidebar shows Checklist Templates",
    (await tplNav.count()) > 0
  );

  // ── 1. Templates list: empty state → create ──
  await page.goto(BASE + "/dashboard/progress-app/templates", {
    waitUntil: "networkidle",
  });
  const emptyState = await page
    .locator("text=No checklist templates yet.")
    .count();
  ok("templates empty state", emptyState > 0);
  await page.screenshot({ path: path.join(OUT, "pc-templates-empty.png") });

  await page
    .getByRole("button", { name: /new template/i })
    .first()
    .click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  await page.fill("#tpl-name", `${RUN} Living Checklist`);
  await page.fill("#tpl-description", "Standard living room works");
  await page.getByRole("button", { name: /create template/i }).click();
  await page.waitForTimeout(1200);
  const tplRow = page.locator("tr", { hasText: `${RUN} Living Checklist` });
  ok("template appears in list", (await tplRow.count()) > 0);

  // ── 2. Template detail: add activities + reorder ──
  await tplRow.locator("a").first().click();
  await page.waitForURL(/progress-app\/templates\//, { timeout: 10000 });
  const tplId = page.url().split("/templates/")[1].replace(/\/$/, "");
  await page.waitForSelector("text=No activities yet.", { timeout: 15000 });
  ok("template detail empty activities", true);

  const activities = ["Brick Work", "Plaster", "Wiring", "Painting"];
  for (const name of activities) {
    await page
      .getByRole("button", { name: /add activity/i })
      .first()
      .click();
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible", timeout: 10000 }).catch(async () => {
      await page.getByRole("button", { name: /add activity/i }).first().click();
      await dialog.waitFor({ state: "visible" });
    });
    await page.fill("#ti-name", name);
    await dialog.getByRole("button", { name: /add activity/i }).click();
    await page.waitForTimeout(900);
  }
  await page.reload({ waitUntil: "networkidle" });
  const actRows = await page.locator("tbody tr").count();
  ok("4 activities added", actRows === 4, `rows=${actRows}`);

  // reorder: move "Brick Work" down
  const firstRow = page.locator("tbody tr").first();
  await firstRow.locator('button[title="Move down"]').click();
  await page.waitForTimeout(1000);
  const firstName = await page
    .locator("tbody tr")
    .first()
    .locator("td")
    .nth(1)
    .textContent();
  ok(
    "reorder moved activity down",
    firstName?.trim() === "Plaster",
    `first=${firstName}`
  );
  const tplVersion = await prisma.progressActivityTemplate.findUnique({
    where: { id: tplId },
    select: { version: true },
  });
  ok("template version bumped on edits", tplVersion.version > 1);
  await page.screenshot({ path: path.join(OUT, "pc-template-detail.png") });

  // ── 3. Room detail → assign checklist ──
  await page.goto(
    `${BASE}/dashboard/progress-app/rooms/${room1.id}`,
    { waitUntil: "networkidle" }
  );
  await page.waitForSelector("text=No checklist assigned.", {
    timeout: 15000,
  });
  const notConf = await page
    .locator("text=Progress not configured")
    .count();
  ok(
    "unassigned room shows 'Progress not configured'",
    notConf > 0
  );
  await page.screenshot({ path: path.join(OUT, "pc-room-unassigned.png") });

  await page.getByRole("button", { name: /assign checklist/i }).click();
  const assignDialog = page.locator('[role="dialog"]');
  await assignDialog.waitFor({ state: "visible" });
  await page.locator("#checklist-template").click();
  await page
    .getByRole("option", { name: new RegExp(`${RUN} Living Checklist`) })
    .click();
  await page.waitForSelector("text=/will be copied as a snapshot/i", {
    timeout: 10000,
  });
  ok("assign preview shows snapshot info", true);
  await assignDialog
    .getByRole("button", { name: /assign checklist/i })
    .click();
  await page.waitForTimeout(1500);
  const roomActs = await page.locator("tbody tr").count();
  ok("checklist activities render in room", roomActs === 4, `rows=${roomActs}`);
  const notStarted = await page.locator("text=Not started").count();
  ok("all activities start 'Not started'", notStarted === 4);
  const zeroPct = await page.locator("text=0%").count();
  ok("room progress starts at 0%", zeroPct > 0);
  await page.screenshot({ path: path.join(OUT, "pc-room-checklist.png") });

  // ── 4. Simulate field updates (no ERP UI by design — direct DB) ──
  const acts = await prisma.progressRoomActivity.findMany({
    where: { roomChecklist: { roomId: room1.id, isActive: true } },
    orderBy: { displayOrder: "asc" },
  });
  await prisma.progressRoomActivity.update({
    where: { id: acts[0].id },
    data: { status: "COMPLETED", revision: 1, updatedById: admin.id },
  });
  await prisma.progressRoomActivity.update({
    where: { id: acts[1].id },
    data: { status: "COMPLETED", revision: 1, updatedById: admin.id },
  });
  await prisma.progressRoomActivity.update({
    where: { id: acts[2].id },
    data: { status: "IN_PROGRESS", revision: 1, updatedById: admin.id },
  });

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("text=50%", { timeout: 15000 });
  ok("room shows 50% after 2/4 completed", true);
  const statusChips = await page.locator("text=Completed").count();
  ok("completed chips render", statusChips >= 2);

  // flat page: progress bar + unconfigured-room warning (Store Room)
  await page.goto(`${BASE}/dashboard/progress-app/flats/${flat.id}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("text=Flat progress", { timeout: 15000 });
  const flatPct = await page.locator("text=50%").count();
  ok("flat progress card shows 50%", flatPct > 0);
  const unconfWarn = await page
    .locator("text=/no checklist|Not configured/i")
    .count();
  ok("unconfigured room warning shown at flat level", unconfWarn > 0);
  const storeNotConf = await page
    .locator("tr", { hasText: "Store Room" })
    .locator("text=/not configured/i")
    .count();
  ok("unconfigured room row shows 'Not configured'", storeNotConf > 0);
  await page.screenshot({ path: path.join(OUT, "pc-flat-progress.png") });

  // site summary: aggregate visible
  await page.goto(`${BASE}/dashboard/progress-app/sites/${site.id}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("text=Site progress", { timeout: 15000 });
  const sitePct = await page.locator("text=50%").count();
  ok("site progress summary shows 50%", sitePct > 0);
  await page.screenshot({ path: path.join(OUT, "pc-site-progress.png") });

  // ── 5. Template edit isolation ──
  await page.goto(`${BASE}/dashboard/progress-app/templates/${tplId}`, {
    waitUntil: "networkidle",
  });
  const addDlg = page.locator('[role="dialog"]');
  await page
    .getByRole("button", { name: /add activity/i })
    .first()
    .click();
  await addDlg.waitFor({ state: "visible", timeout: 10000 }).catch(async () => {
    // Hydration race on fresh page load — retry the click.
    await page
      .getByRole("button", { name: /add activity/i })
      .first()
      .click();
    await addDlg.waitFor({ state: "visible" });
  });
  await page.fill("#ti-name", "Post-Assign Activity");
  await addDlg.getByRole("button", { name: /add activity/i }).click();
  await page.waitForTimeout(1500);
  const tplAfter = await prisma.progressActivityTemplate.findUnique({
    where: { id: tplId },
    select: { version: true },
  });
  // Items table renders before the rooms-using table — first table is items.
  const itemsTableRows = await page
    .locator("table")
    .first()
    .locator("tbody tr")
    .count();
  const tplItemCount = await prisma.progressActivityTemplateItem.count({
    where: { templateId: tplId },
  });
  ok(
    "template now has 5 activities",
    tplItemCount === 5 && itemsTableRows === 5,
    `db=${tplItemCount} ui=${itemsTableRows}`
  );

  await page.goto(`${BASE}/dashboard/progress-app/rooms/${room1.id}`, {
    waitUntil: "networkidle" ,
  });
  await page.waitForSelector("text=Brick Work|text=Plaster", {
    timeout: 15000,
  }).catch(() => {});
  const roomActsCount = await prisma.progressRoomActivity.count({
    where: { roomChecklist: { roomId: room1.id, isActive: true } },
  });
  ok(
    "existing room snapshot unchanged by template edit",
    roomActsCount === 4,
    `snapshot=${roomActsCount}`
  );
  const cl = await prisma.progressRoomChecklist.findFirst({
    where: { roomId: room1.id, isActive: true },
  });
  ok(
    "snapshot version older than template",
    cl.templateVersion < tplAfter.version,
    `snap=v${cl.templateVersion} tpl=v${tplAfter.version}`
  );

  // ── 6. Replace checklist with impact preview ──
  const tpl2 = await prisma.progressActivityTemplate.create({
    data: {
      name: `${RUN} Bath Checklist`,
      createdById: admin.id,
      items: {
        create: [
          { activityName: "Plumbing", displayOrder: 0 },
          { activityName: "Waterproofing", displayOrder: 1 },
          { activityName: "Tiling", displayOrder: 2 },
        ],
      },
    },
  });
  await page.goto(`${BASE}/dashboard/progress-app/rooms/${room1.id}`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: /replace checklist/i }).click();
  const repDlg = page.locator('[role="dialog"]');
  await repDlg.waitFor({ state: "visible" });
  await page.locator("#checklist-template").click();
  await page
    .getByRole("option", { name: new RegExp(`${RUN} Bath Checklist`) })
    .click();
  await page.waitForSelector("text=/will be replaced/i", { timeout: 10000 });
  ok("replace shows impact preview", true);
  await repDlg
    .getByRole("button", { name: /replace checklist/i })
    .click();
  await page.waitForTimeout(1500);
  const newActs = await prisma.progressRoomActivity.count({
    where: { roomChecklist: { roomId: room1.id, isActive: true } },
  });
  ok("replaced checklist has 3 activities", newActs === 3);
  const oldCl = await prisma.progressRoomChecklist.findFirst({
    where: { roomId: room1.id, isActive: false },
    include: { activities: true },
  });
  ok(
    "old checklist preserved (inactive, activities intact)",
    oldCl !== null && oldCl.activities.length === 4
  );
  const roomPctAfter = await page.locator("text=0%").count();
  ok("progress resets to 0% after replace", roomPctAfter > 0);
  await page.screenshot({ path: path.join(OUT, "pc-room-replaced.png") });

  // ── 7. Deactivate template preserves progress ──
  await page.goto(BASE + "/dashboard/progress-app/templates", {
    waitUntil: "networkidle",
  });
  const t2row = page.locator("tr", { hasText: `${RUN} Bath Checklist` });
  await t2row.locator('button[title*="Deactivate"]').click();
  const confDlg = page.locator('[role="dialog"]');
  await confDlg.waitFor({ state: "visible" });
  await confDlg.getByRole("button", { name: /^deactivate$/i }).click();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: "networkidle" });
  const t2rowAfter = page.locator("tr", { hasText: `${RUN} Bath Checklist` });
  ok(
    "template deactivated shows Inactive",
    (await t2rowAfter.locator("text=Inactive").count()) > 0
  );
  const stillThere = await prisma.progressRoomActivity.count({
    where: { roomChecklist: { roomId: room1.id, isActive: true } },
  });
  ok("deactivated template preserves room checklist", stillThere === 3);

  // ── 8. Staff read-only ──
  const staffCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const staff = await staffCtx.newPage();
  await login(staff, "staff@saec.com", "StaffView123!");
  await staff.goto(`${BASE}/dashboard/progress-app/rooms/${room1.id}`, {
    waitUntil: "networkidle",
  });
  await staff.waitForSelector("text=Plumbing", { timeout: 15000 });
  const staffAssign = await staff
    .getByRole("button", { name: /checklist/i })
    .count();
  ok("staff sees checklist but no assign control", staffAssign === 0);
  await staff.goto(BASE + "/dashboard/progress-app/templates", {
    waitUntil: "networkidle",
  });
  const staffNew = await staff
    .getByRole("button", { name: /new template/i })
    .count();
  ok("staff read-only on templates", staffNew === 0);
  await staff.screenshot({ path: path.join(OUT, "pc-room-staff.png") });

  // ── 9. Responsive ──
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/dashboard/progress-app/rooms/${room1.id}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("text=Plumbing", { timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, "pc-room-mobile-390.png") });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(`${BASE}/dashboard/progress-app/flats/${flat.id}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("text=Flat progress", { timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, "pc-flat-tablet-768.png") });
  ok("mobile + tablet layouts render", true);

  const fatal = errors.filter(
    (e) => !/favicon|chunk|hydration|DevTools|third-?party|preload/i.test(e)
  );
  ok("no console/page errors", fatal.length === 0, fatal[0] ?? "");

  await browser.close();
  await prisma.$disconnect();

  console.log("\n=== Progress Checklists QA results ===");
  results.forEach((r) => console.log(r));
  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed.`
  );
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error("QA crashed:", e);
  results.forEach((r) => console.log(r));
  process.exit(1);
});
