const { chromium } = require("@playwright/test");
const crypto = require("crypto");
const fs = require("fs");
const results = [];
const BASE = process.env.QA_BASE_URL || "http://localhost:3100";
const QA_EMAIL = process.env.QA_EMAIL;
const QA_PASSWORD = process.env.QA_PASSWORD;
if (!QA_EMAIL || !QA_PASSWORD) {
  console.error("Set QA_EMAIL and QA_PASSWORD env vars (test credentials). Refusing to run with defaults.");
  process.exit(2);
}
const ok = (n, p, note="") => results.push(`${p?"PASS":"FAIL"} ${n}${note?" — "+note:""}`);
(async () => {
  const b = await chromium.launch({ channel: "chrome" });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto("" + BASE + "/login", { waitUntil: "networkidle" });
  await p.fill('input[type="email"], #email', QA_EMAIL);
  await p.fill('input[type="password"], #password', QA_PASSWORD);
  await p.click('button[type="submit"]');
  await p.waitForURL(/dashboard/, { timeout: 20000 });
  ok("login", true);

  // upload then IMMEDIATELY fetch via /uploads route (the fixed behavior)
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  const up = await p.evaluate(async (bytes) => {
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(bytes)], {type:"application/pdf"}), "RouteTest.pdf");
    fd.append("module", "qa-route");
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    return { s: r.status, b: await r.json().catch(()=>({})) };
  }, [...pdf]);
  ok("upload ok", up.s === 200, JSON.stringify(up.b));
  const f = await p.evaluate(async ({ u, base }) => {
    const r = await fetch(new URL(u, base)); const ab = await r.arrayBuffer();
    return { s: r.status, n: ab.byteLength, t: r.headers.get("content-type"), cd: r.headers.get("content-disposition") };
  }, { u: up.b.path, base: BASE });
  ok("runtime upload served IMMEDIATELY via route", f.s === 200 && f.n === pdf.length, `${f.s} ${f.n}B ${f.t}`);

  // legacy file via new route
  const leg = await p.evaluate(async () => {
    const r = await fetch("/uploads/in-out-register-doc/1700000000000_legacy-letter.pdf");
    return { s: r.status, n: (await r.arrayBuffer()).byteLength };
  });
  ok("legacy /uploads file via route", leg.s === 200 && leg.n === 593, `${leg.s} ${leg.n}B`);

  // traversal rejection
  const tr = await p.evaluate(async () => {
    const r = await fetch(new URL("/uploads/..%2F..%2Fpackage.json", location.href));
    return r.status;
  });
  ok("traversal rejected (400/404)", tr === 400 || tr === 404, `status=${tr}`);

  // missing file → 404 JSON not found
  const nf = await p.evaluate(async () => {
    const r = await fetch(new URL("/uploads/qa-route/does-not-exist.pdf", location.href));
    return { s: r.status, b: await r.text() };
  });
  ok("missing file → 404 friendly", nf.s === 404 && /could not be found/i.test(nf.b), `${nf.s}`);

  // symlink escape: link inside uploads -> outside must be refused
  const fsx = require("fs"), pathx = require("path");
  const escLink = pathx.join(process.cwd(), "public/uploads/qa-escape-test");
  try { fsx.symlinkSync(pathx.join(process.cwd(), "package.json"), escLink); } catch {}
  const esc = await p.evaluate(async () => {
    const r = await fetch("/uploads/qa-escape-test"); return r.status;
  });
  ok("symlink escape refused", esc === 404 || esc === 400, `status=${esc}`);
  try { fsx.unlinkSync(escLink); } catch {}

  // symlink to private_uploads content must also be refused
  const privLink = pathx.join(process.cwd(), "public/uploads/qa-priv-escape");
  try { fsx.symlinkSync(pathx.join(process.cwd(), "private_uploads"), privLink); } catch {}
  const esc2 = await p.evaluate(async () => {
    const r = await fetch("/uploads/qa-priv-escape/anything.pdf"); return r.status;
  });
  ok("private_uploads escape refused", esc2 === 404 || esc2 === 400, `status=${esc2}`);
  try { fsx.unlinkSync(privLink); } catch {}

  // unauth rejection
  const anon = await b.newContext();
  const ap = await anon.newPage();
  const r1 = await ap.goto("" + BASE + "" + up.b.path);
  ok("unauth /uploads → login redirect", r1.url().includes("/login"), r1.url());
  await anon.close();

  // mobile viewport preview check (route is viewport-agnostic but verify dialog-embeddable)
  const mctx = await b.newContext({ viewport: { width: 375, height: 812 }, storageState: await ctx.storageState() });
  const mp = await mctx.newPage();
  const mr = await mp.goto("" + BASE + "" + up.b.path);
  const mres = mr ? mr.status() : 0;
  ok("mobile fetch serves pdf", mres === 200, `${mres}`);
  await mctx.close();

  results.forEach(r => console.log(r));
  const fails = results.filter(r => r.startsWith("FAIL"));
  console.log(fails.length ? `${fails.length} FAILURES` : "ALL PASS");
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error("crash", e); process.exit(1); });
