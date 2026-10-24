const { chromium } = require("@playwright/test");
const crypto = require("crypto");
const fs = require("fs");
const results = [];
const ok = (n, p, note="") => results.push(`${p?"PASS":"FAIL"} ${n}${note?" — "+note:""}`);
(async () => {
  const b = await chromium.launch({ channel: "chrome" });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto("http://localhost:3100/login", { waitUntil: "networkidle" });
  await p.fill('input[type="email"], #email', "admin@saec.com");
  await p.fill('input[type="password"], #password', "QaTest123!");
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
  const f = await p.evaluate(async (u) => {
    const r = await fetch(new URL(u, "http://localhost:3100")); const ab = await r.arrayBuffer();
    return { s: r.status, n: ab.byteLength, t: r.headers.get("content-type"), cd: r.headers.get("content-disposition") };
  }, up.b.path);
  ok("runtime upload served IMMEDIATELY via route", f.s === 200 && f.n === pdf.length, `${f.s} ${f.n}B ${f.t}`);

  // legacy file via new route
  const leg = await p.evaluate(async () => {
    const r = await fetch("/uploads/in-out-register-doc/1700000000000_legacy-letter.pdf", { });
    return { s: r.status, n: (await r.arrayBuffer()).byteLength };
  });
  ok("legacy /uploads file via route", leg.s === 200 && leg.n === 593, `${leg.s} ${leg.n}B`);

  // traversal rejection
  const tr = await p.evaluate(async () => {
    const r = await fetch(new URL("/uploads/..%2F..%2Fpackage.json", "http://localhost:3100"));
    return r.status;
  });
  ok("traversal rejected (400/404)", tr === 400 || tr === 404, `status=${tr}`);

  // missing file → 404 JSON not found
  const nf = await p.evaluate(async () => {
    const r = await fetch(new URL("/uploads/qa-route/does-not-exist.pdf", "http://localhost:3100"));
    return { s: r.status, b: await r.text() };
  });
  ok("missing file → 404 friendly", nf.s === 404 && /could not be found/i.test(nf.b), `${nf.s}`);

  // unauth rejection
  const anon = await b.newContext();
  const ap = await anon.newPage();
  const r1 = await ap.goto("http://localhost:3100" + up.b.path);
  ok("unauth /uploads → login redirect", r1.url().includes("/login"), r1.url());
  await anon.close();

  // mobile viewport preview check (route is viewport-agnostic but verify dialog-embeddable)
  const mctx = await b.newContext({ viewport: { width: 375, height: 812 }, storageState: await ctx.storageState() });
  const mp = await mctx.newPage();
  const mr = await mp.goto("http://localhost:3100" + up.b.path);
  const mres = mr ? mr.status() : 0;
  ok("mobile fetch serves pdf", mres === 200, `${mres}`);
  await mctx.close();

  results.forEach(r => console.log(r));
  const fails = results.filter(r => r.startsWith("FAIL"));
  console.log(fails.length ? `${fails.length} FAILURES` : "ALL PASS");
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error("crash", e); process.exit(1); });
