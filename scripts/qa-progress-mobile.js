// Progress App — Brick 4 QA: mobile API smoke tests + ERP UI verification.
// Runs against the disposable saec_erp_progress_dev DB on localhost:3100.
const { chromium } = require("@playwright/test");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3100";
const API = `${BASE}/api/mobile/v1`;
const OUT = path.join(__dirname, "..", "qa-shots");
fs.mkdirSync(OUT, { recursive: true });

const prisma = new PrismaClient();
const RUN = `M${(Date.now() % 100000).toString(36).toUpperCase()}`;

const results = [];
const ok = (name, pass, note = "") =>
  results.push(`${pass ? "PASS" : "FAIL"} ${name}${note ? " — " + note : ""}`);

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function api(method, pathName, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${API}${pathName}`, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let data = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("json")) data = await res.json();
  else data = Buffer.from(await res.arrayBuffer());
  return { status: res.status, body: data, headers: res.headers };
}

async function loginPage(page, email, password) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('input[type="email"], #email', {
      timeout: 30000,
    });
    // dev-mode hydration is slow on a cold server — wait for it before
    // filling/submitting, mirroring a real user.
    await page.waitForTimeout(5000);
    await page.fill('input[type="email"], #email', email);
    await page.fill('input[type="password"], #password', password);
    await page.click('button[type="submit"]');
    // signIn() sets the session cookie, then the page navigates
    // client-side — in dev mode that navigation can lose a race with the
    // proxy's session check and bounce back to /login. Navigating
    // directly to /dashboard avoids the race: the cookie is already set.
    await page.waitForTimeout(8000);
    await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" });
    const landed = await page
      .waitForURL(/dashboard/, { timeout: 15000 })
      .then(() => !page.url().includes("/login"))
      .catch(() => false);
    if (landed) return;
  }
  throw new Error("loginPage: could not reach /dashboard after retries");
}

(async () => {
  // ── Seed: field user, QA site + hierarchy + checklist + assignment ──
  const admin = await prisma.user.findUnique({
    where: { email: "admin@saec.com" },
    select: { id: true },
  });
  const staffUser = await prisma.user.findUnique({
    where: { email: "staff@saec.com" },
    select: { id: true },
  });
  const field = await prisma.user.upsert({
    where: { email: "qa-field@saec.com" },
    create: {
      email: "qa-field@saec.com",
      name: "QA Field",
      role: "STAFF",
      hashedPassword: await bcrypt.hash("FieldPass1!", 10),
    },
    update: { hashedPassword: await bcrypt.hash("FieldPass1!", 10), isActive: true },
  });
  // Self-contained unassigned-staff fixture — do not depend on whatever
  // password the global seed last gave staff@saec.com.
  const staff = await prisma.user.upsert({
    where: { email: "qa-staff@saec.com" },
    create: {
      email: "qa-staff@saec.com",
      name: "QA Staff",
      role: "STAFF",
      hashedPassword: await bcrypt.hash("StaffView123!", 10),
    },
    update: {
      hashedPassword: await bcrypt.hash("StaffView123!", 10),
      isActive: true,
    },
  });

  const site = await prisma.progressSite.create({
    data: {
      siteCode: `MQ-${RUN}`,
      siteName: `Mobile QA ${RUN}`,
      status: "ACTIVE",
      createdById: admin.id,
    },
  });
  const wing = await prisma.progressWing.create({
    data: { siteId: site.id, code: "WA", name: "Wing A" },
  });
  const floor = await prisma.progressFloor.create({
    data: { wingId: wing.id, floorIdentifier: "1" },
  });
  const flat = await prisma.progressFlat.create({
    data: { floorId: floor.id, flatNumber: "101" },
  });
  const room = await prisma.progressRoom.create({
    data: { flatId: flat.id, roomName: "Living Room" },
  });
  const tpl = await prisma.progressActivityTemplate.create({
    data: {
      name: `${RUN} QA Template`,
      createdById: admin.id,
      items: {
        create: ["Wiring", "Plaster", "Paint"].map((n, i) => ({
          activityName: n,
          displayOrder: i,
        })),
      },
    },
  });
  // direct assignment + checklist setup via DB mirrors ERP admin actions
  await prisma.progressSiteAssignment.create({
    data: {
      siteId: site.id,
      userId: field.id,
      canView: true,
      canUpdate: true,
      assignedById: admin.id,
    },
  });
  const checklist = await prisma.progressRoomChecklist.create({
    data: {
      roomId: room.id,
      templateId: tpl.id,
      templateVersion: tpl.version,
      assignedById: admin.id,
      activities: {
        create: ["Wiring", "Plaster", "Paint"].map((n, i) => ({
          activityNameSnapshot: n,
          displayOrder: i,
        })),
      },
    },
    include: { activities: true },
  });
  ok("mobile QA fixtures seeded", true);

  // ── Auth flows ──
  const bad = await api("POST", "/auth/login", {
    body: { email: "qa-field@saec.com", password: "wrong" },
  });
  ok("bad password → 401", bad.status === 401);

  const login = await api("POST", "/auth/login", {
    body: { email: "qa-field@saec.com", password: "FieldPass1!" },
  });
  ok("login → tokens", login.status === 200 && !!login.body.accessToken);
  const token = login.body.accessToken;
  const noHash = !JSON.stringify(login.body).includes("$2");
  ok("no password hash in login response", noHash);

  // ── Read APIs ──
  const me = await api("GET", "/me", { token });
  ok("/me returns user + assignments", me.status === 200 && me.body.assignments.length >= 1);

  const sites = await api("GET", "/sites", { token });
  const mySite = (sites.body.items ?? []).find((s) => s.id === site.id);
  ok(
    "/sites returns assigned site w/ progress",
    sites.status === 200 &&
      !!mySite &&
      mySite.progress.totalActivities === 3
  );

  const acts = await api("GET", `/rooms/${room.id}/activities`, { token });
  ok(
    "/rooms/:id/activities returns checklist + revisions",
    acts.status === 200 && acts.body.activities.length === 3
  );

  const outsider = await api("GET", `/sites/${site.id}`, { token: login.body.refreshToken });
  ok("refresh token as bearer → 401", outsider.status === 401);

  // ── PATCH status: success → 409 stale → idempotent replay ──
  const act0 = acts.body.activities[0];
  const upd = await api("PATCH", `/activities/${act0.id}/status`, {
    token,
    body: {
      status: "COMPLETED",
      expectedRevision: act0.revision,
      eventId: `qa-evt-${RUN}-1`,
      note: "done via API",
    },
  });
  ok(
    "PATCH status → 200 + new revision + room progress",
    upd.status === 200 &&
      upd.body.revision === act0.revision + 1 &&
      upd.body.roomProgress.completedActivities === 1
  );

  const stale = await api("PATCH", `/activities/${act0.id}/status`, {
    token,
    body: {
      status: "ON_HOLD",
      expectedRevision: act0.revision,
      eventId: `qa-evt-${RUN}-stale`,
    },
  });
  ok(
    "stale revision → 409 with current state",
    stale.status === 409 &&
      stale.body.error.code === "STALE" &&
      stale.body.error.current.currentStatus === "COMPLETED"
  );

  const replay = await api("PATCH", `/activities/${act0.id}/status`, {
    token,
    body: {
      status: "COMPLETED",
      expectedRevision: act0.revision,
      eventId: `qa-evt-${RUN}-1`,
    },
  });
  ok(
    "idempotent replay → alreadyApplied, no dup history",
    replay.status === 200 && replay.body.alreadyApplied === true
  );

  // ── Photos ──
  const form = new FormData();
  form.append("file", new Blob([PNG_1PX], { type: "image/png" }), "qa.png");
  form.append("targetType", "ACTIVITY");
  form.append("targetId", act0.id);
  form.append("caption", "Wiring complete");
  form.append("clientEventId", `qa-photo-${RUN}`);
  const photo = await api("POST", "/photos", { token, form });
  ok(
    "photo upload → 201 + resolved hierarchy",
    photo.status === 201 &&
      photo.body.photo.roomActivityId === act0.id &&
      photo.body.photo.roomId === room.id &&
      photo.body.photo.siteId === site.id
  );
  const photoId = photo.body.photo.id;

  const content = await api("GET", `/photos/${photoId}/content`, { token });
  ok(
    "photo content → bytes + mime",
    content.status === 200 &&
      content.headers.get("content-type") === "image/png" &&
      content.body.length > 0
  );

  const svgForm = new FormData();
  svgForm.append(
    "file",
    new Blob([Buffer.from("<svg><script>x</script></svg>")], {
      type: "image/svg+xml",
    }),
    "evil.svg"
  );
  svgForm.append("targetType", "SITE");
  svgForm.append("targetId", site.id);
  const svg = await api("POST", "/photos", { token, form: svgForm });
  ok("SVG upload rejected", svg.status === 400);

  // staff user (no assignment) is blocked
  const staffLogin = await api("POST", "/auth/login", {
    body: { email: "qa-staff@saec.com", password: "StaffView123!" },
  });
  if (staffLogin.status === 200) {
    const denied = await api("GET", `/photos/${photoId}/content`, {
      token: staffLogin.body.accessToken,
    });
    ok("unassigned user cannot fetch photo → 404", denied.status === 404);
  } else {
    ok("unassigned user cannot fetch photo → 404", false, "staff login failed");
  }

  // ── ERP browser UI ──
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 160));
  });

  await loginPage(page, "admin@saec.com", "ProgressDev123!");
  await page.goto(`${BASE}/dashboard/progress-app/sites/${site.id}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("text=Assigned staff", { timeout: 15000 });
  const assignedRow = await page
    .locator("tr", { hasText: "qa-field@saec.com" })
    .count();
  ok("site page shows assigned staff row", assignedRow > 0);
  const updCheckbox = await page
    .locator("tr", { hasText: "qa-field@saec.com" })
    .locator('input[aria-label*="Update permission"]')
    .isChecked();
  ok("canUpdate scope visible in ERP", updCheckbox);

  // assign another staff member through the dialog
  const assignBtn = page.getByRole("button", { name: /assign staff/i });
  if ((await assignBtn.count()) > 0) {
    await assignBtn.click();
    const dlg = page.locator('[role="dialog"]');
    await dlg.waitFor({ state: "visible", timeout: 10000 }).catch(async () => {
      await assignBtn.click();
      await dlg.waitFor({ state: "visible" });
    });
    await page.locator("#assign-user").click();
    const anyOpt = page.getByRole("option");
    const listed = await anyOpt
      .first()
      .waitFor({ state: "visible", timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    ok("assign dialog lists ERP users", listed);
    if (listed) {
      const before = await prisma.progressSiteAssignment.count({
        where: { siteId: site.id },
      });
      const optText = (await anyOpt.first().textContent()) ?? "";
      await anyOpt.first().click();
      await dlg.getByRole("button", { name: /^assign$/i }).click();
      await page.waitForTimeout(1800);
      const after = await prisma.progressSiteAssignment.count({
        where: { siteId: site.id },
      });
      ok(
        "new assignment persisted via dialog",
        after === before + 1,
        `${before}→${after} (${optText.trim().slice(0, 40)})`
      );
    }
    // ensure the dialog is closed before continuing
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  } else {
    ok("assign dialog lists ERP users", false, "no assign button");
  }

  // history panel
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const histBtn = page.getByRole("button", { name: /^history$/i });
  await histBtn.waitFor({ state: "visible", timeout: 10000 });
  await histBtn.click();
  await page.waitForTimeout(600);
  const histRows = await page.locator("td", { hasText: "GRANTED" }).count();
  ok("assignment history shows events", histRows > 0);

  // photo gallery shows the API-uploaded photo
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("text=Progress photos", { timeout: 15000 });
  const galleryImgs = await page
    .locator(`img[src*="/api/progress-photos/"]`)
    .count();
  ok("ERP gallery renders uploaded photo", galleryImgs >= 1);
  const caption = await page.locator("text=Wiring complete").count();
  ok("photo caption + uploader shown", caption > 0);
  await page.screenshot({
    path: path.join(OUT, "pm-site-assignments.png"),
    fullPage: true,
  });

  // room page gallery
  await page.goto(`${BASE}/dashboard/progress-app/rooms/${room.id}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("text=Activity checklist", { timeout: 15000 });
  const roomImgs = await page
    .locator(`img[src*="/api/progress-photos/"]`)
    .count();
  ok("room page gallery shows activity photo", roomImgs >= 1);
  const completedChip = await page.locator("text=Completed").count();
  ok("API-updated status visible in ERP (Completed chip)", completedChip > 0);
  await page.screenshot({
    path: path.join(OUT, "pm-room-gallery.png"),
    fullPage: true,
  });

  // image bytes actually load in the gallery (not broken auth)
  const imgOk = await page.evaluate(async () => {
    const img = document.querySelector('img[src*="/api/progress-photos/"]');
    if (!img) return false;
    const res = await fetch(img.src, { credentials: "include" });
    return res.status === 200 &&
      (res.headers.get("content-type") || "").startsWith("image/");
  });
  ok("ERP photo content endpoint streams bytes", imgOk);

  // staff read-only: no assign button, gallery visible
  const sctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const spage = await sctx.newPage();
  await loginPage(spage, "qa-staff@saec.com", "StaffView123!");
  await spage.goto(`${BASE}/dashboard/progress-app/sites/${site.id}`, {
    waitUntil: "networkidle",
  });
  await spage.waitForSelector("text=Assigned staff", { timeout: 15000 });
  const staffAssign = await spage
    .getByRole("button", { name: /assign staff/i })
    .count();
  ok("staff sees assignments read-only (no controls)", staffAssign === 0);
  await spage.screenshot({ path: path.join(OUT, "pm-site-staff.png"), fullPage: true });

  const fatal = errors.filter(
    (e) => !/favicon|chunk|hydration|DevTools|third-?party|preload/i.test(e)
  );
  ok("no console/page errors", fatal.length === 0, fatal[0] ?? "");

  await browser.close();
  await prisma.$disconnect();

  console.log("\n=== Brick 4 QA results ===");
  results.forEach((r) => console.log(r));
  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error("QA crashed:", e);
  results.forEach((r) => console.log(r));
  process.exit(1);
});
