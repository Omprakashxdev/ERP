const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const BASE_URL = "postgresql://shivang@localhost:5432";
const TEST_DB = "saec_erp_drift_val_20261016";
const MIGRATIONS_DIR = path.join(__dirname, "..", "prisma", "migrations");
const DRAFT_SQL = path.join(__dirname, "..", "prisma", "migrations", "safe_drift_draft_corrected.sql");

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

async function runMigrations(client) {
  const dirs = fs.readdirSync(MIGRATIONS_DIR)
    .filter((d) => /^\d+_/.test(d))
    .sort();

  for (const dir of dirs) {
    const sqlPath = path.join(MIGRATIONS_DIR, dir, "migration.sql");
    if (!fs.existsSync(sqlPath)) {
      log(`Skipping ${dir} — no migration.sql`);
      continue;
    }
    const sql = fs.readFileSync(sqlPath, "utf-8");
    log(`Applying migration: ${dir}`);
    await client.query(sql);
  }
  log("All migrations applied.");
}

async function insertTestData(client) {
  log("Inserting representative test data...");

  // Minimal prerequisite data
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

  // Test data for enum conversion verification
  await client.query(`
    INSERT INTO "Project" (
      id, "regionId", "clientId", name, "workOrderDate",
      "timeLimitMonths", "estimatedCost", "totalFee",
      "workType", "serviceType", "createdAt", "updatedAt"
    ) VALUES (
      'project-1', 'region-1', 'client-1', 'Test Project',
      '2024-01-15', 12, 1000000, 118000,
      'BUILDING', 'SUPERVISION', NOW(), NOW()
    )
  `);

  await client.query(`
    INSERT INTO "Contractor" (
      id, name, "contactPerson", phone, address,
      "workType", "serviceType", "createdAt", "updatedAt"
    ) VALUES (
      'contractor-1', 'Test Contractor', 'Ramesh', '9876543210', 'Ahmedabad',
      'WATER_SUPPLY', 'DPR', NOW(), NOW()
    )
  `);

  await client.query(`
    INSERT INTO "Tender" (
      id, name, status, "tenderDate",
      "workType", "serviceType", "preBidMeetingAttended",
      "createdAt", "updatedAt"
    ) VALUES (
      'tender-1', 'Test Tender', 'UNDER_PREPARATION', NOW(),
      'ROAD', 'PMC', false, NOW(), NOW()
    )
  `);

  // Test data for InOutRegister preservation
  await client.query(`
    INSERT INTO "InOutRegister" (
      id, "documentDate", "receivedDate", "documentRefNo",
      details, "clientId", "actionSuggestedStaffId",
      "replyDate", "replyRefNo", "createdAt", "updatedAt"
    ) VALUES (
      'inout-1', '2025-07-01', '2025-07-03', 'GSPHC/2025/001',
      'Test details', 'client-1', 'staff-1',
      '2025-07-10', 'REPLY-001', NOW(), NOW()
    )
  `);

  log("Test data inserted.");
}

async function runDraftSql(client) {
  const sql = fs.readFileSync(DRAFT_SQL, "utf-8");
  log("Applying corrected draft SQL...");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
    log("Draft SQL applied successfully.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

async function verifyResults(client) {
  log("Running verification queries...");

  // 1. Enum values preserved
  const project = await client.query(`SELECT "workType", "serviceType" FROM "Project" WHERE id = 'project-1'`);
  if (project.rows[0].workType !== 'BUILDING' || project.rows[0].serviceType !== 'SUPERVISION') {
    fail(`Project enum conversion failed: ${JSON.stringify(project.rows[0])}`);
  } else {
    log("PASS: Project enum values preserved.");
  }

  const contractor = await client.query(`SELECT "workType", "serviceType" FROM "Contractor" WHERE id = 'contractor-1'`);
  if (contractor.rows[0].workType !== 'WATER_SUPPLY' || contractor.rows[0].serviceType !== 'DPR') {
    fail(`Contractor enum conversion failed: ${JSON.stringify(contractor.rows[0])}`);
  } else {
    log("PASS: Contractor enum values preserved.");
  }

  const tender = await client.query(`SELECT "workType", "serviceType" FROM "Tender" WHERE id = 'tender-1'`);
  if (tender.rows[0].workType !== 'ROAD' || tender.rows[0].serviceType !== 'PMC') {
    fail(`Tender enum conversion failed: ${JSON.stringify(tender.rows[0])}`);
  } else {
    log("PASS: Tender enum values preserved.");
  }

  // 2. InOutRegister columns preserved
  const inout = await client.query(`SELECT "replyDate", "replyRefNo", direction FROM "InOutRegister" WHERE id = 'inout-1'`);
  if (inout.rows[0].replyDate === null || inout.rows[0].replyRefNo !== 'REPLY-001') {
    fail(`InOutRegister preservation failed: ${JSON.stringify(inout.rows[0])}`);
  } else {
    log("PASS: InOutRegister replyDate and replyRefNo preserved.");
  }

  // 3. Direction default applied
  if (inout.rows[0].direction !== 'INWARD') {
    fail(`InOutRegister direction default failed: expected INWARD, got ${inout.rows[0].direction}`);
  } else {
    log("PASS: InOutRegister direction defaulted to INWARD.");
  }

  // 4. Indexes preserved
  const idxRes = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'InOutRegister'
    AND indexname IN ('InOutRegister_replyDate_idx', 'InOutRegister_replyRefNo_key')
  `);
  if (idxRes.rows.length !== 2) {
    fail(`Index preservation failed: expected 2 indexes, found ${idxRes.rows.length}`);
  } else {
    log("PASS: InOutRegister reply indexes preserved.");
  }

  // 5. New tables exist
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

  // 6. Enum types dropped
  const enumRes = await client.query(`
    SELECT typname FROM pg_type WHERE typname IN ('WorkType', 'ServiceType')
  `);
  if (enumRes.rows.length !== 0) {
    fail(`Obsolete enum types still exist: ${enumRes.rows.map((r) => r.typname).join(', ')}`);
  } else {
    log("PASS: Obsolete enum types dropped.");
  }

  // 7. New enum types exist
  const newEnumRes = await client.query(`
    SELECT typname FROM pg_type WHERE typname IN ('RegistrationStatus', 'AssetMovementType', 'InOutDirection', 'ForwardStatus')
  `);
  if (newEnumRes.rows.length !== 4) {
    fail(`New enum types missing: found ${newEnumRes.rows.length}/4`);
  } else {
    log("PASS: New enum types created.");
  }
}

async function main() {
  try {
    await createDatabase();
    await withClient(TEST_DB, async (client) => {
      await runMigrations(client);
      await insertTestData(client);
      await runDraftSql(client);
      await verifyResults(client);
    });
  } catch (err) {
    fail(`Unexpected error: ${err.message}`);
    console.error(err.stack);
  } finally {
    log(`Final exit code: ${exitCode}`);
    process.exit(exitCode);
  }
}

main();
