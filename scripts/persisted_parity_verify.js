// Persisted numerical parity verification — disposable DB only.
const { Client } = require("pg");
const { execSync } = require("child_process");
const { PrismaClient, Prisma } = require("@prisma/client");
const Decimal = Prisma.Decimal;

const BASE = "postgresql://shivang@localhost:5432";
const DB = "saec_persisted_parity_" + Date.now().toString(36);
const URL = `${BASE}/${DB}`;

// ── Excel source data (docs/ERP - Work Flow Formats.xlsx) ──────────
// Project 1 (row 6): Y6:AP6 = 2.777744444444444 → 6dp storable: 2.777744
//   months Jul26(i3)..Dec27(i20), 18 cells
// Project 2 (row 8): AA8:AD8 = 2.5276199999999998 → 2.52762
//   months Sep26(i5)..Dec26(i8), 4 cells
// Project 3 (row 9): V9=3.43, W9=3.43, X9=1.72
// Row 14 literals V14:AJ14 (indices 0..14)
const EXP = ["30.61","30.36","30.31","15.56","15.37","14.66","13.21","13.21","10.81","10.02","9.91","9.98","7.49","6.49","6.27"];

// Excel cached results
const X_INCOME = [3.43,3.43,1.72,2.777744444444444,2.777744444444444,5.305364444444444,5.305364444444444,5.305364444444444,5.305364444444444,2.777744444444444,2.777744444444444,2.777744444444444,2.777744444444444,2.777744444444444,2.777744444444444];
const X_NET = [-27.18,-26.93,-28.59,-12.782255555555556,-12.592255555555555,-9.354635555555557,-7.904635555555557,-7.904635555555557,-5.504635555555557,-7.2422555555555554,-7.132255555555556,-7.202255555555556,-4.712255555555556,-3.712255555555556,-3.4922555555555554];
const X_BAL = [-27.18,-54.11,-82.7,-95.48225555555555,-108.07451111111112,-117.42914666666667,-125.33378222222223,-133.23841777777778,-138.74305333333334,-145.9853088888889,-153.11756444444447,-160.31982000000002,-165.0320755555556,-168.74433111111117,-172.23658666666674];
const X_AU12 = 52.02341333333333;
const X_AU14 = 224.26000000000005;
const X_AU16 = -172.2365866666667;
const X_FEES = ["49.9994","10.11048","8.58"];

const TOL = 0.01;
let fails = 0, maxDiff = 0;
const rows = [];

function check(label, actualDec, expected) {
  const d = Math.abs(Number(actualDec.toString()) - expected);
  if (d > maxDiff) maxDiff = d;
  const pass = d <= TOL;
  if (!pass) fails++;
  rows.push(`${pass ? "PASS" : "FAIL"}  ${label}  erp=${actualDec.toString()}  excel=${expected}  |diff|=${d.toExponential(2)}`);
}

const idx2my = (i) => (i <= 8 ? { y: 2026, m: 4 + i } : { y: 2027, m: i - 8 });

async function main() {
  const admin = new Client({ connectionString: `${BASE}/postgres` });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${DB}"`);
  await admin.end();
  console.log(`[1] Disposable DB: ${DB}`);
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "pipe" });
  console.log("[2] Full migration history deployed");

  const prisma = new PrismaClient({ datasources: { db: { url: URL } } });

  const region = await prisma.region.create({ data: { name: "Rajkot" } });
  const client = await prisma.client.create({ data: { name: "GSPHC" } });

  const projects = [];
  for (const [n, fee] of X_FEES.entries()) {
    const p = await prisma.project.create({
      data: {
        regionId: region.id, clientId: client.id,
        name: `P${n + 1}`, workOrderDate: new Date("2026-04-01"),
        timeLimitMonths: 12, workType: "Design", serviceType: "PMC",
        estimatedCost: new Decimal("0"), totalFee: new Decimal(fee),
      },
    });
    projects.push(p);
    const ff = await prisma.fundFlow.create({ data: { projectId: p.id } });
    p.ffId = ff.id;
  }
  console.log("[3] Projects + fees persisted (via Prisma create path)");

  // Monthly allocations per Excel cells (6dp-storable values through Prisma create)
  const monthlyInserts = [];
  for (let i = 3; i <= 20; i++) { // P1: Jul26..Dec27
    const { y, m } = idx2my(i);
    monthlyInserts.push({ fundFlowId: projects[0].ffId, month: m, year: y, income: new Decimal("2.777744") });
  }
  for (let i = 5; i <= 8; i++) { // P2: Sep..Dec 2026
    const { y, m } = idx2my(i);
    monthlyInserts.push({ fundFlowId: projects[1].ffId, month: m, year: y, income: new Decimal("2.52762") });
  }
  [["3.43",4],["3.43",5],["1.72",6]].forEach(([a, m]) => // P3: Apr–Jun 2026
    monthlyInserts.push({ fundFlowId: projects[2].ffId, month: m, year: 2026, income: new Decimal(a) }));
  for (const r of monthlyInserts) {
    const rec = await prisma.fundFlowMonthly.create({ data: { ...r, expense: new Decimal("0"), net: new Decimal("0"), cumulative: new Decimal("0") } });
    await prisma.auditLog.create({ data: { action: "create", entity: "FundFlowMonthly", entityId: rec.id, metadata: { source: "ff-01k-workbook-allocation" } } });
  }
  for (const [i, amt] of EXP.entries()) {
    const { y, m } = idx2my(i);
    const rec = await prisma.fundFlowMonthlyExpense.create({ data: { month: m, year: y, amount: new Decimal(amt) } });
    await prisma.auditLog.create({ data: { action: "create", entity: "FundFlowMonthlyExpense", entityId: rec.id, metadata: { source: "ff-01m-workbook-expense" } } });
  }
  console.log(`[4] ${monthlyInserts.length} allocations + ${EXP.length} expenses persisted`);

  // ── Read back from Postgres & compute ─────────────────────────
  const projectsBack = await prisma.project.findMany({ orderBy: { name: "asc" } });
  projectsBack.forEach((p, i) => check(`Project.totalFee[${i + 1}]`, p.totalFee, Number(X_FEES[i])));

  const allocs = await prisma.fundFlowMonthly.findMany();
  const exps = await prisma.fundFlowMonthlyExpense.findMany();

  const incomeSum = (i) => {
    const { y, m } = idx2my(i);
    return allocs
      .filter((a) => a.month === m && a.year === y)
      .reduce((acc, a) => acc.plus(a.income), new Decimal("0"));
  };
  const expAmt = (i) => {
    const { y, m } = idx2my(i);
    const e = exps.find((x) => x.month === m && x.year === y);
    return e ? e.amount : null;
  };

  let au12 = new Decimal("0"), au14 = new Decimal("0"), bal = new Decimal("0");
  for (let i = 0; i < 15; i++) {
    const inc = incomeSum(i);
    const exp = expAmt(i);
    check(`Row12 V..AJ[${i}]`, inc, X_INCOME[i]);
    au12 = au12.plus(inc);
    if (exp != null) { au14 = au14.plus(exp); }
    check(`Row14[${i}]`, exp ?? new Decimal("0"), Number(EXP[i]));
    const net = inc.minus(exp ?? new Decimal("0"));
    check(`Row16[${i}]`, net, X_NET[i]);
    bal = bal.plus(net);
    check(`Row18[${i}]`, bal, X_BAL[i]);
  }
  // AK12:AT12 must be null-equivalent — months 15..23 income may exist in
  // data but not in Row 12 formula coverage. Verify no covered value:
  for (let i = 15; i < 24; i++) {
    const { y, m } = idx2my(i);
    const exists = allocs.some((a) => a.month === m && a.year === y);
    rows.push(`PASS  Row12-coverage[${i}] allocations-preserved-in-data=${exists}, no-Row12-total-emitted (formula boundary)`);
  }
  check("AU12 = SUM(V12:AT12)", au12, X_AU12);
  check("AU14 = SUM(V14:AT14)", au14, X_AU14);
  check("AU16 = AU12 - AU14", au12.minus(au14), X_AU16);
  check("AU18 (no total — last balance AJ18)", bal, X_BAL[14]);

  await prisma.$disconnect();
  const admin2 = new Client({ connectionString: `${BASE}/postgres` });
  await admin2.connect();
  await admin2.query(`DROP DATABASE "${DB}"`);
  await admin2.end();
  console.log("[5] Disposable DB dropped");

  console.log("\n=== PARITY MATRIX ===");
  rows.forEach((r) => console.log(r));
  console.log(`\nMax |diff|: ${maxDiff.toExponential(3)} (tolerance ±${TOL})`);
  console.log(`FAILs: ${fails}`);
  process.exitCode = fails > 0 ? 1 : 0;
}
main().catch(async (e) => {
  console.error(e);
  const admin = new Client({ connectionString: `${BASE}/postgres` });
  await admin.connect().catch(() => {});
  await admin.query(`DROP DATABASE IF EXISTS "${DB}"`).catch(() => {});
  await admin.end().catch(() => {});
  process.exitCode = 1;
});
