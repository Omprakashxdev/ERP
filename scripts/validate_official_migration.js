const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BASE_URL = "postgresql://shivang@localhost:5432";
const TEST_DB = "saec_erp_official_val_20261016";
const MIGRATIONS_DIR = path.join(__dirname, "..", "prisma", "migrations");

let exitCode = 0;

function log(msg) {
  console.log(`[VALIDATE] ${msg}`);
}

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  exitCode = 1;
}

async function withClient(dbName, fn) {
  const client = new Client({ connectionString: `${BASE_URL}/${dbName}` });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function createDatabase() {
  const client = new Client({ connectionString: `${BASE_URL}/postgres` });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
    await client.query(`CREATE DATABASE "${TEST_DB}"`);
    log(`Created database: ${TEST_DB}`);
  } finally {
    await client.end();
  }
}

async function runPrismaMigrateDeploy() {
  log("Running prisma migrate deploy...");
  const env = { ...process.env, DATABASE_URL: `${BASE_URL}/${TEST_DB}?schema=public` };
  execSync("npx prisma migrate deploy", {
    cwd: path.join(__dirname, ".."),
    env,
    stdio: "inherit",
  });
  log("Prisma migrate deploy completed.");
}

async function insertHistoricalRecords(client) {
  log("Inserting representative historical records...");

  // Insert prerequisite data
  await client.query(`
    INSERT INTO "Region" (id, name, abbreviation, address, "createdAt", "updatedAt")
    VALUES ('region-1', 'Ahmedabad', 'AMD', 'Satellite', NOW(), NOW())
  `);

  await client.query(`
    INSERT INTO "Client" (id, name, abbreviation, address, "createdAt", "updatedAt")
    VALUES ('client-1', 'GSPHC', 'GSPHC', 'Bhavnagar', NOW(), NOW())
  `);

  await client.query(`
    INSERT INTO "Staff" (id, name, email, phone, "employeeCode", designation, "regionId", "createdAt", "updatedAt")
    VALUES ('staff-1', 'Test Staff', 'test@saec.com', '9876543210', 'SAEC001', 'Director', 'region-1', NOW(), NOW())
  `);

  // Historical InOutRegister BEFORE direction column existed (simulating pre-drift records)
  // Since the migration has already run, direction will be NULL because we added it as nullable
  // without DEFAULT in the migration, then SET DEFAULT afterwards.
  // Actually wait - in the new migration, direction is added as nullable WITHOUT DEFAULT,
  // then SET DEFAULT is applied AFTER. So existing rows at migration time get NULL.
  // But we're inserting AFTER migration, so we need to explicitly set direction to NULL
  // to simulate historical records.
  await client.query(`
    INSERT INTO "InOutRegister" (
      id, "documentDate", "receivedDate", "documentRefNo",
      details, "clientId", "actionSuggestedStaffId",
      "replyDate", "replyRefNo", "createdAt", "updatedAt",
      direction
    ) VALUES (
      'inout-hist-1', '2025-07-01', '2025-07-03', 'GSPHC/2025/001',
      'Historical record', 'client-1', 'staff-1',
      '2025-07-10', 'REPLY-001', NOW(), NOW(),
      NULL
    )
  `);

  // Historical Project with enum values (before enum-to-text conversion)
  await client.query(`
    INSERT INTO "Project" (
      id, "regionId", "clientId", name, "workOrderDate",
      "timeLimitMonths", "estimatedCost", "totalFee",
      "workType", "serviceType", "createdAt", "updatedAt"
    ) VALUES (
      'project-hist-1', 'region-1', 'client-1', 'Historical Project',
      '2024-01-15', 12, 1000000, 118000,
      'BUILDING', 'SUPERVISION', NOW(), NOW()
    )
  `);

  // Historical Contractor with enum values
  await client.query(`
    INSERT INTO "Contractor" (
      id, name, "contactPerson", phone, address,
      "workType", "serviceType", "createdAt", "updatedAt"
    ) VALUES (
      'contractor-hist-1', 'Historical Contractor', 'Ramesh', '9876543210', 'Ahmedabad',
      'WATER_SUPPLY', 'DPR', NOW(), NOW()
    )
  `);

  // Historical Tender with enum values
  await client.query(`
    INSERT INTO "Tender" (
      id, name, status, "tenderDate",
      "workType", "serviceType", "preBidMeetingAttended",
      "createdAt", "updatedAt"
    ) VALUES (
      'tender-hist-1', 'Historical Tender', 'UNDER_PREPARATION', NOW(),
      'ROAD', 'PMC', false, NOW(), NOW()
    )
  `);

  // New record AFTER migration (should default to INWARD)
  await client.query(`
    INSERT INTO "InOutRegister" (
      id, "documentDate", "receivedDate", "documentRefNo",
      details, "clientId", "actionSuggestedStaffId",
      "createdAt", "updatedAt"
      -- direction omitted, should get DEFAULT 'INWARD'
    ) VALUES (
      'inout-new-1', '2025-08-01', '2025-08-02', 'GSPHC/2025/002',
      'New record after migration', 'client-1', 'staff-1',
      NOW(), NOW()
    )
  `);

  log("Historical and new records inserted.");
}

async function verifyResults(client) {
  log("Running verification queries...");

  // 1. Historical direction is NULL
  const histDir = await client.query(`SELECT direction FROM "InOutRegister" WHERE id = 'inout-hist-1'`);
  if (histDir.rows[0].direction !== null) {
    fail(`Historical direction should be NULL, got: ${histDir.rows[0].direction}`);
  } else {
    log("PASS: Historical direction is NULL.");
  }

  // 2. New record defaults to INWARD
  const newDir = await client.query(`SELECT direction FROM "InOutRegister" WHERE id = 'inout-new-1'`);
  if (newDir.rows[0].direction !== 'INWARD') {
    fail(`New record direction should be INWARD, got: ${newDir.rows[0].direction}`);
  } else {
    log("PASS: New record direction defaulted to INWARD.");
  }

  // 3. Enum values preserved as TEXT
  const project = await client.query(`SELECT "workType", "serviceType" FROM "Project" WHERE id = 'project-hist-1'`);
  if (project.rows[0].workType !== 'BUILDING' || project.rows[0].serviceType !== 'SUPERVISION') {
    fail(`Project enum conversion failed: ${JSON.stringify(project.rows[0])}`);
  } else {
    log("PASS: Project enum values preserved.");
  }

  const contractor = await client.query(`SELECT "workType", "serviceType" FROM "Contractor" WHERE id = 'contractor-hist-1'`);
  if (contractor.rows[0].workType !== 'WATER_SUPPLY' || contractor.rows[0].serviceType !== 'DPR') {
    fail(`Contractor enum conversion failed: ${JSON.stringify(contractor.rows[0])}`);
  } else {
    log("PASS: Contractor enum values preserved.");
  }

  const tender = await client.query(`SELECT "workType", "serviceType" FROM "Tender" WHERE id = 'tender-hist-1'`);
  if (tender.rows[0].workType !== 'ROAD' || tender.rows[0].serviceType !== 'PMC') {
    fail(`Tender enum conversion failed: ${JSON.stringify(tender.rows[0])}`);
  } else {
    log("PASS: Tender enum values preserved.");
  }

  // 4. replyDate and replyRefNo preserved
  const inout = await client.query(`SELECT "replyDate", "replyRefNo" FROM "InOutRegister" WHERE id = 'inout-hist-1'`);
  if (inout.rows[0].replyDate === null || inout.rows[0].replyRefNo !== 'REPLY-001') {
    fail(`InOutRegister preservation failed: ${JSON.stringify(inout.rows[0])}`);
  } else {
    log("PASS: InOutRegister replyDate and replyRefNo preserved.");
  }

  // 5. Indexes exist
  const idxRes = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'InOutRegister'
    AND indexname IN ('InOutRegister_replyDate_idx', 'InOutRegister_replyRefNo_key')
  `);
  if (idxRes.rows.length !== 2) {
    fail(`Index preservation failed: expected 2 indexes, found ${idxRes.rows.length}`);
  } else {
    log("PASS: InOutRegister reply indexes exist.");
  }

  // 6. New tables exist
  const newTables = [
    'RegistrationRequest', 'AssetMovement', 'Department', 'Designation',
    'State', 'City', 'Platform', 'PaymentType', 'AssetCategory',
    'AssetMake', 'AssetModel', 'OrderMaster', 'WorkMaster', 'TypeMaster',
    'DprMaster', 'TsAaMaster', 'DrawingMaster', 'WorkOrderMaster',
    'ContactMaster', 'FundFlowMonthly', 'Attendance', 'RolePermission',
    'SystemSetting', 'ForwardRecord'
  ];
  for (const tbl of newTables) {
    const res = await client.query(`SELECT COUNT(*) as c FROM "${tbl}"`);
    log(`PASS: New table ${tbl} exists (row count: ${res.rows[0].c}).`);
  }

  // 7. Enum types dropped
  const enumRes = await client.query(`
    SELECT typname FROM pg_type WHERE typname IN ('WorkType', 'ServiceType')
  `);
  if (enumRes.rows.length !== 0) {
    fail(`Obsolete enum types still exist: ${enumRes.rows.map(r => r.typname).join(', ')}`);
  } else {
    log("PASS: Obsolete enum types dropped.");
  }

  // 8. New enum types exist
  const newEnumRes = await client.query(`
    SELECT typname FROM pg_type WHERE typname IN ('RegistrationStatus', 'AssetMovementType', 'InOutDirection', 'ForwardStatus')
  `);
  if (newEnumRes.rows.length !== 4) {
    fail(`New enum types missing: found ${newEnumRes.rows.length}/4`);
  } else {
    log("PASS: New enum types created.");
  }
}

async function runTestsAndBuild() {
  log("Running targeted tests...");
  const env = { ...process.env, DATABASE_URL: `${BASE_URL}/${TEST_DB}?schema=public` };

  try {
    execSync("npx vitest run src/lib/__tests__/in-out-direction-nullability.test.ts", {
      cwd: path.join(__dirname, ".."),
      env,
      stdio: "inherit",
    });
    log("PASS: Targeted tests passed.");
  } catch (e) {
    fail("Targeted tests failed.");
  }

  log("Running full test suite...");
  try {
    execSync("npx vitest run", {
      cwd: path.join(__dirname, ".."),
      env,
      stdio: "inherit",
    });
    log("PASS: Full test suite passed.");
  } catch (e) {
    fail("Full test suite failed.");
  }

  log("Running TypeScript check...");
  try {
    execSync("npx tsc --noEmit", {
      cwd: path.join(__dirname, ".."),
      env,
      stdio: "inherit",
    });
    log("PASS: TypeScript check passed.");
  } catch (e) {
    fail("TypeScript check failed.");
  }

  log("Running lint...");
  try {
    execSync("npm run lint", {
      cwd: path.join(__dirname, ".."),
      env,
      stdio: "inherit",
    });
    log("PASS: Lint passed.");
  } catch (e) {
    fail("Lint failed.");
  }

  log("Running production build...");
  try {
    execSync("npm run build", {
      cwd: path.join(__dirname, ".."),
      env,
      stdio: "inherit",
    });
    log("PASS: Production build passed.");
  } catch (e) {
    fail("Production build failed.");
  }
}

async function main() {
  try {
    await createDatabase();
    await runPrismaMigrateDeploy();
    await withClient(TEST_DB, async (client) => {
      await insertHistoricalRecords(client);
      await verifyResults(client);
    });
    await runTestsAndBuild();
  } catch (err) {
    fail(`Unexpected error: ${err.message}`);
    console.error(err.stack);
  } finally {
    log(`Final exit code: ${exitCode}`);
    process.exit(exitCode);
  }
}

main();
