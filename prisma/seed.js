const { PrismaClient, Role } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@saec.com";
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const hashedPassword = await bcrypt.hash(password, 12);

  const adminUser = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "System Administrator",
      hashedPassword,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  console.log(`Admin user ${email} seeded.`);

  // --- Regions ---
  const regions = await Promise.all([
    prisma.region.upsert({ where: { name: "Ahmedabad" }, update: {}, create: { name: "Ahmedabad", abbreviation: "AMD", address: "Satellite, Ahmedabad" } }),
    prisma.region.upsert({ where: { name: "Rajkot" }, update: {}, create: { name: "Rajkot", abbreviation: "RAJ", address: "Race Course Road, Rajkot" } }),
    prisma.region.upsert({ where: { name: "Surat" }, update: {}, create: { name: "Surat", abbreviation: "SUR", address: "Ring Road, Surat" } }),
  ]);
  console.log(`Seeded ${regions.length} regions`);

  // --- Clients ---
  const clients = await Promise.all([
    prisma.client.upsert({ where: { name_abbreviation: { name: "GSPHC", abbreviation: "GSPHC" } }, update: {}, create: { name: "GSPHC", abbreviation: "GSPHC", address: "Khanbhogala, Bhavnagar" } }),
    prisma.client.upsert({ where: { name_abbreviation: { name: "GUDM", abbreviation: "GUDM" } }, update: {}, create: { name: "GUDM", abbreviation: "GUDM", address: "Gandhinagar" } }),
    prisma.client.upsert({ where: { name_abbreviation: { name: "Surat Municipal Corporation", abbreviation: "SMC" } }, update: {}, create: { name: "Surat Municipal Corporation", abbreviation: "SMC", address: "Mughalsarai, Surat" } }),
    prisma.client.upsert({ where: { name_abbreviation: { name: "Rajkot Municipal Corporation", abbreviation: "RMC" } }, update: {}, create: { name: "Rajkot Municipal Corporation", abbreviation: "RMC", address: "Dhebar Road, Rajkot" } }),
  ]);
  console.log(`Seeded ${clients.length} clients`);

  // --- Staff ---
  const staff = await Promise.all([
    prisma.staff.upsert({ where: { email: "jitendra@saec.com" }, update: {}, create: { name: "Jitendra Patel", email: "jitendra@saec.com", phone: "9825012345", employeeCode: "SAEC001", designation: "Director", regionId: regions[0].id } }),
    prisma.staff.upsert({ where: { email: "foram@saec.com" }, update: {}, create: { name: "Foram Shah", email: "foram@saec.com", phone: "9825023456", employeeCode: "SAEC002", designation: "Project Manager", regionId: regions[0].id } }),
    prisma.staff.upsert({ where: { email: "rakesh@saec.com" }, update: {}, create: { name: "Rakesh Joshi", email: "rakesh@saec.com", phone: "9825034567", employeeCode: "SAEC003", designation: "Residential Engineer", regionId: regions[1].id } }),
    prisma.staff.upsert({ where: { email: "neha@saec.com" }, update: {}, create: { name: "Neha Mehta", email: "neha@saec.com", phone: "9825045678", employeeCode: "SAEC004", designation: "Design Engineer", regionId: regions[2].id } }),
    prisma.staff.upsert({ where: { email: "amit@saec.com" }, update: {}, create: { name: "Amit Desai", email: "amit@saec.com", phone: "9825056789", employeeCode: "SAEC005", designation: "Site Engineer", regionId: regions[1].id } }),
  ]);
  console.log(`Seeded ${staff.length} staff`);

  // --- Contractors ---
  const existingContractors = await prisma.contractor.findMany();
  const contractorNames = ["Shree Balaji Construction", "Patel Infrastructure"];
  const contractors = [];
  for (const name of contractorNames) {
    const existing = existingContractors.find((c) => c.name === name);
    if (existing) {
      contractors.push(existing);
    } else {
      const data = name === "Shree Balaji Construction"
        ? { name, contactPerson: "Ramesh Bhai", phone: "9876543210", address: "Ahmedabad" }
        : { name, contactPerson: "Suresh Patel", phone: "9876543211", address: "Rajkot" };
      contractors.push(await prisma.contractor.create({ data }));
    }
  }
  console.log(`Seeded ${contractors.length} contractors`);

  // --- Projects ---
  const projects = await Promise.all([
    prisma.project.upsert({
      where: { clientId_name: { clientId: clients[0].id, name: "GSPHC Abad Division - 1st RA" } },
      update: {},
      create: {
        name: "GSPHC Abad Division - 1st RA",
        regionId: regions[0].id,
        clientId: clients[0].id,
        workOrderDate: new Date("2019-01-15"),
        timeLimitMonths: 12,
        estimatedCost: 10000000,
        totalFee: 11800,
        workType: "BUILDING",
        serviceType: "SUPERVISION",
        address: "Aurangabad Division",
      },
    }),
    prisma.project.upsert({
      where: { clientId_name: { clientId: clients[1].id, name: "GUDM Wadhvan TPI" } },
      update: {},
      create: {
        name: "GUDM Wadhvan TPI",
        regionId: regions[1].id,
        clientId: clients[1].id,
        workOrderDate: new Date("2024-08-01"),
        timeLimitMonths: 18,
        estimatedCost: 7500000,
        totalFee: 88500,
        workType: "WATER_SUPPLY",
        serviceType: "TPI",
        address: "Wadhvan, Surendranagar",
      },
    }),
    prisma.project.upsert({
      where: { clientId_name: { clientId: clients[1].id, name: "GUDM Khambhaliya WS DPR" } },
      update: {},
      create: {
        name: "GUDM Khambhaliya WS DPR",
        regionId: regions[2].id,
        clientId: clients[1].id,
        workOrderDate: new Date("2025-05-01"),
        timeLimitMonths: 6,
        estimatedCost: 5000000,
        totalFee: 146202,
        workType: "WATER_SUPPLY",
        serviceType: "DPR",
        address: "Khambhaliya, Devbhumi Dwarka",
      },
    }),
    prisma.project.upsert({
      where: { clientId_name: { clientId: clients[1].id, name: "GUDM Kutiyana UGD DPR" } },
      update: {},
      create: {
        name: "GUDM Kutiyana UGD DPR",
        regionId: regions[1].id,
        clientId: clients[1].id,
        workOrderDate: new Date("2026-01-01"),
        timeLimitMonths: 6,
        estimatedCost: 8000000,
        totalFee: 295000,
        workType: "UGD",
        serviceType: "DPR",
        address: "Kutiyana, Porbandar",
      },
    }),
  ]);
  console.log(`Seeded ${projects.length} projects`);

  // --- Due Bills ---
  const dueBills = [
    { projectId: projects[0].id, scheme: "1st RA", grossAmount: 10000, sgst: 900, cgst: 900, billAmount: 11800, chequeAmount: 9600, sd: 1000, itTds: 1200, receivedAmount: 11800, billDate: new Date("2019-03-22"), receiveDate: new Date("2019-05-01"), status: "PAID" },
    { projectId: projects[0].id, scheme: "2nd RA", grossAmount: 45000, sgst: 4050, cgst: 4050, billAmount: 53100, chequeAmount: 43200, sd: 4500, itTds: 5400, receivedAmount: 53100, billDate: new Date("2019-05-28"), receiveDate: new Date("2019-10-24"), status: "PAID" },
    { projectId: projects[1].id, scheme: "TPI", grossAmount: 75000, sgst: 6750, cgst: 6750, billAmount: 88500, chequeAmount: 79650, sd: 0, itTds: 8850, receivedAmount: 88500, billDate: new Date("2024-11-01"), receiveDate: new Date("2025-04-30"), status: "PAID" },
    { projectId: projects[1].id, scheme: "TPI", grossAmount: 33300, sgst: 2997, cgst: 2997, billAmount: 39294, chequeAmount: 0, sd: 0, itTds: 0, receivedAmount: 0, billDate: new Date("2026-01-21"), receiveDate: null, status: "PENDING", remarks: "Pending" },
    { projectId: projects[2].id, scheme: "DPR", grossAmount: 123900, sgst: 11151, cgst: 11151, billAmount: 146202, chequeAmount: 131581.80, sd: 0, itTds: 14620.20, receivedAmount: 146202, billDate: new Date("2025-07-22"), receiveDate: new Date("2026-03-26"), status: "PAID" },
    { projectId: projects[3].id, scheme: "DPR", grossAmount: 250000, sgst: 22500, cgst: 22500, billAmount: 295000, chequeAmount: 0, sd: 0, itTds: 0, receivedAmount: 0, billDate: new Date("2026-04-13"), receiveDate: null, status: "PENDING", remarks: "Pending" },
  ];
  for (const bill of dueBills) {
    await prisma.dueBill.create({ data: bill });
  }
  console.log(`Seeded ${dueBills.length} due bills`);

  // --- Fund Flow ---
  const fundFlows = [
    { projectId: projects[0].id, miscExp: 500, staffExp: 2000, totalProjectCost: 2500, completedWorkAmt: 10000, proposedDueBillAmount: 11800, feeReceived: 11800 },
    { projectId: projects[1].id, miscExp: 1500, staffExp: 5000, totalProjectCost: 6500, completedWorkAmt: 75000, proposedDueBillAmount: 88500, feeReceived: 88500 },
    { projectId: projects[2].id, miscExp: 2000, staffExp: 8000, totalProjectCost: 10000, completedWorkAmt: 123900, proposedDueBillAmount: 146202, feeReceived: 146202 },
  ];
  for (const ff of fundFlows) {
    await prisma.fundFlow.upsert({ where: { projectId: ff.projectId }, update: ff, create: ff });
  }
  console.log(`Seeded ${fundFlows.length} fund flows`);

  // --- WIP ---
  const wips = [
    { projectId: projects[0].id, status: "COMPLETED", workOrderDate: new Date("2019-01-15"), timeLimitMonths: 12, stipulatedCompletionDate: new Date("2020-01-15"), completionDate: new Date("2019-12-20"), hoCoordinatorId: staff[0].id, roCoordinatorId: staff[2].id, securityDepositAmount: 1180, securityDepositStatus: "Returned", amountOfWorkDone: 10000, finalProgressAmount: 10000 },
    { projectId: projects[1].id, status: "IN_PROGRESS", workOrderDate: new Date("2024-08-01"), timeLimitMonths: 18, stipulatedCompletionDate: new Date("2026-02-01"), hoCoordinatorId: staff[1].id, roCoordinatorId: staff[4].id, securityDepositAmount: 8850, securityDepositStatus: "Deposited", amountOfWorkDone: 75000 },
    { projectId: projects[2].id, status: "IN_PROGRESS", workOrderDate: new Date("2025-05-01"), timeLimitMonths: 6, stipulatedCompletionDate: new Date("2025-11-01"), hoCoordinatorId: staff[1].id, roCoordinatorId: staff[3].id, securityDepositAmount: 14620, securityDepositStatus: "Deposited", amountOfWorkDone: 123900 },
  ];
  for (const wip of wips) {
    await prisma.workInProgress.upsert({ where: { projectId: wip.projectId }, update: wip, create: wip });
  }
  console.log(`Seeded ${wips.length} WIP records`);

  // --- Tenders ---
  const tenders = [
    { name: "SMC - Drainage Work Tender", tenderDate: new Date("2025-06-01"), department: "SMC", state: "Gujarat", city: "Surat", platform: "e-Procurement", workName: "Drainage Work", workType: "UGD", serviceType: "SUPERVISION", biddingLastDate: new Date("2025-06-20"), dateOfOpening: new Date("2025-06-21"), tenderFeeAmount: 5000, emdAmount: 50000, status: "WON", l1ContractorName: "Shree Balaji Construction", l1Amount: 2500000 },
    { name: "RMC - Water Supply DPR", tenderDate: new Date("2025-07-15"), department: "RMC", state: "Gujarat", city: "Rajkot", platform: "e-Procurement", workName: "Water Supply DPR", workType: "WATER_SUPPLY", serviceType: "DPR", biddingLastDate: new Date("2025-08-01"), dateOfOpening: new Date("2025-08-02"), tenderFeeAmount: 2000, emdAmount: 20000, status: "SUBMITTED" },
    { name: "GUDM - Road Work TPI", tenderDate: new Date("2025-08-10"), department: "GUDM", state: "Gujarat", city: "Gandhinagar", platform: "e-Procurement", workName: "Road Work TPI", workType: "ROAD", serviceType: "TPI", biddingLastDate: new Date("2025-08-30"), dateOfOpening: new Date("2025-08-31"), tenderFeeAmount: 3000, emdAmount: 30000, status: "UNDER_PREPARATION" },
  ];
  for (const t of tenders) {
    await prisma.tender.create({ data: t });
  }
  console.log(`Seeded ${tenders.length} tenders`);

  // --- Payment Schedules ---
  const payments = [
    { date: new Date("2025-07-01"), dueDate: new Date("2025-07-15"), paymentType: "GST Q1", category: "GST", detail: "Q1 FY25-26 GST Payment", amount: 45000, status: "PAID" },
    { date: new Date("2025-10-01"), dueDate: new Date("2025-10-15"), paymentType: "GST Q2", category: "GST", detail: "Q2 FY25-26 GST Payment", amount: 52000, status: "PENDING" },
    { date: new Date("2025-09-01"), dueDate: new Date("2025-09-10"), paymentType: "TDS", category: "TDS", detail: "August TDS", amount: 12000, status: "PAID" },
    { date: new Date("2025-10-01"), dueDate: new Date("2025-10-10"), paymentType: "TDS", category: "TDS", detail: "September TDS", amount: 15000, status: "OVERDUE" },
    { date: new Date("2025-06-01"), dueDate: new Date("2025-06-05"), paymentType: "Vehicle Loan", category: "VEHICLE_LOAN", detail: "Car Loan EMI", amount: 18000, status: "PAID" },
    { date: new Date("2025-07-01"), dueDate: new Date("2025-07-05"), paymentType: "Vehicle Loan", category: "VEHICLE_LOAN", detail: "Car Loan EMI", amount: 18000, status: "PAID" },
  ];
  for (const p of payments) {
    await prisma.paymentSchedule.create({ data: p });
  }
  console.log(`Seeded ${payments.length} payment schedules`);

  // --- Vehicles ---
  const vehicles = await Promise.all([
    prisma.vehicle.upsert({ where: { registrationNumber: "GJ01AB1234" }, update: {}, create: { registrationNumber: "GJ01AB1234", make: "Maruti Suzuki", model: "Swift Dzire", year: 2022, status: "ACTIVE", rcNumber: "RC2022001", rcExpiryDate: new Date("2027-01-01"), insurancePolicyNumber: "INS2022001", insuranceExpiryDate: new Date("2026-01-01"), pucExpiryDate: new Date("2025-12-01") } }),
    prisma.vehicle.upsert({ where: { registrationNumber: "GJ03XY5678" }, update: {}, create: { registrationNumber: "GJ03XY5678", make: "Toyota", model: "Innova", year: 2021, status: "ACTIVE", rcNumber: "RC2021002", rcExpiryDate: new Date("2026-06-01"), insurancePolicyNumber: "INS2021002", insuranceExpiryDate: new Date("2025-11-01"), pucExpiryDate: new Date("2025-08-01") } }),
  ]);
  console.log(`Seeded ${vehicles.length} vehicles`);

  // --- Journey Logs ---
  const journeys = [
    { vehicleId: vehicles[0].id, journeyDate: new Date("2025-07-10"), fromLocation: "Ahmedabad", toLocation: "Bhavnagar", startKm: 15000, endKm: 15280, totalKm: 280, fuelExpense: 1200, driverName: "Ramesh", purpose: "Site visit - GSPHC", approvalStatus: "APPROVED" },
    { vehicleId: vehicles[0].id, journeyDate: new Date("2025-07-15"), fromLocation: "Ahmedabad", toLocation: "Gandhinagar", startKm: 15280, endKm: 15320, totalKm: 40, fuelExpense: 200, driverName: "Ramesh", purpose: "GUDM meeting", approvalStatus: "APPROVED" },
    { vehicleId: vehicles[1].id, journeyDate: new Date("2025-07-20"), fromLocation: "Rajkot", toLocation: "Wadhvan", startKm: 42000, endKm: 42110, totalKm: 110, fuelExpense: 500, driverName: "Suresh", purpose: "TPI inspection", approvalStatus: "PENDING" },
  ];
  for (const j of journeys) {
    await prisma.journeyLog.create({ data: j });
  }
  console.log(`Seeded ${journeys.length} journey logs`);

  // --- Assets ---
  const assets = [
    { itemCode: "AST001", name: "Dell Laptop Latitude 5420", category: "Electronics", make: "Dell", model: "Latitude 5420", yearOfPurchase: 2023, quantity: 1, assigneeType: "PERSON", assignee: "Foram Shah", assignedQuantity: 1, responsiblePerson: "Foram Shah", status: "ASSIGNED" },
    { itemCode: "AST002", name: "HP Desktop All-in-One", category: "Electronics", make: "HP", model: "ProOne 440", yearOfPurchase: 2022, quantity: 1, assigneeType: "OFFICE", assignee: "Ahmedabad Office", assignedQuantity: 1, status: "ASSIGNED" },
    { itemCode: "AST003", name: "Total Station Sokkia CX-105", category: "Survey Equipment", make: "Sokkia", model: "CX-105", yearOfPurchase: 2021, quantity: 1, status: "AVAILABLE" },
    { itemCode: "AST004", name: "Office Chair - Executive", category: "Furniture", make: "Godrej", model: "Interio", yearOfPurchase: 2023, quantity: 10, assigneeType: "OFFICE", assignee: "Ahmedabad Office", assignedQuantity: 8, status: "ASSIGNED" },
    { itemCode: "AST005", name: "Printer Canon LBP6030", category: "Electronics", make: "Canon", model: "LBP6030", yearOfPurchase: 2020, quantity: 2, status: "UNDER_MAINTENANCE", remarks: "One unit needs drum replacement" },
  ];
  for (const a of assets) {
    await prisma.asset.upsert({ where: { itemCode: a.itemCode }, update: a, create: a });
  }
  console.log(`Seeded ${assets.length} assets`);

  // --- In-Out Register ---
  const inOuts = [
    { documentDate: new Date("2025-07-01"), receivedDate: new Date("2025-07-03"), documentRefNo: "GSPHC/2025/001", details: "Approval for 1st RA bill", clientId: clients[0].id, actionSuggestedStaffId: staff[1].id, replyDate: new Date("2025-07-10"), replyRefNo: "REPLY/2025/001" },
    { documentDate: new Date("2025-07-15"), receivedDate: new Date("2025-07-16"), documentRefNo: "GUDM/2025/045", details: "TPI work order copy", clientId: clients[1].id, actionSuggestedStaffId: staff[2].id, replyDate: null, replyRefNo: null },
    { documentDate: new Date("2025-08-01"), receivedDate: new Date("2025-08-02"), documentRefNo: "SMC/2025/112", details: "Drainage tender query", clientId: clients[2].id, actionSuggestedStaffId: staff[3].id, replyDate: new Date("2025-08-10"), replyRefNo: "REPLY/2025/002" },
    { documentDate: new Date("2025-08-20"), receivedDate: new Date("2025-08-21"), documentRefNo: "RMC/2025/078", details: "Water supply DPR feedback", clientId: clients[3].id, actionSuggestedStaffId: staff[1].id, replyDate: null, replyRefNo: null },
  ];
  for (const io of inOuts) {
    await prisma.inOutRegister.create({ data: io });
  }
  console.log(`Seeded ${inOuts.length} in-out registers`);

  // --- TADA Claims ---
  const tadaClaims = [
    { staffId: staff[1].id, tourPurpose: "GSPHC site inspection", fromDate: new Date("2025-07-08"), toDate: new Date("2025-07-10"), location: "Bhavnagar", travelExpense: 2500, accommodationExp: 3000, foodExpense: 1500, localConveyance: 500, otherExpense: 0, totalClaimAmount: 7500, advanceAmount: 2000, status: "PAID", paidAt: new Date("2025-07-20"), paymentMode: "Bank Transfer" },
    { staffId: staff[2].id, tourPurpose: "GUDM TPI verification", fromDate: new Date("2025-07-18"), toDate: new Date("2025-07-19"), location: "Wadhvan", travelExpense: 1200, accommodationExp: 1800, foodExpense: 800, localConveyance: 300, otherExpense: 0, totalClaimAmount: 4100, advanceAmount: 1000, status: "SUBMITTED" },
    { staffId: staff[3].id, tourPurpose: "Khambhaliya DPR field visit", fromDate: new Date("2025-08-05"), toDate: new Date("2025-08-07"), location: "Khambhaliya", travelExpense: 3500, accommodationExp: 4000, foodExpense: 2000, localConveyance: 800, otherExpense: 200, totalClaimAmount: 10500, advanceAmount: 3000, status: "MANAGER_APPROVED", managerApprovedAt: new Date("2025-08-10") },
    { staffId: staff[4].id, tourPurpose: "Rajkot office coordination", fromDate: new Date("2025-08-12"), toDate: new Date("2025-08-12"), location: "Rajkot", travelExpense: 600, accommodationExp: 0, foodExpense: 400, localConveyance: 200, otherExpense: 0, totalClaimAmount: 1200, status: "DRAFT" },
  ];
  for (const tc of tadaClaims) {
    await prisma.tadaClaim.create({ data: tc });
  }
  console.log(`Seeded ${tadaClaims.length} TADA claims`);

  // --- Tasks ---
  const tasks = [
    { title: "Prepare 2nd RA bill for GSPHC", description: "Compile expenses and prepare 2nd running account bill", assignedToId: staff[1].id, assignedById: adminUser.id, projectId: projects[0].id, dueDate: new Date("2025-08-15"), priority: "HIGH", status: "COMPLETED", completedAt: new Date("2025-08-10") },
    { title: "TPI report for Wadhvan", description: "Prepare TPI inspection report for Wadhvan water supply", assignedToId: staff[2].id, assignedById: adminUser.id, projectId: projects[1].id, dueDate: new Date("2025-08-30"), priority: "MEDIUM", status: "IN_PROGRESS" },
    { title: "DPR submission Khambhaliya", description: "Finalize and submit DPR for Khambhaliya WS", assignedToId: staff[3].id, assignedById: adminUser.id, projectId: projects[2].id, dueDate: new Date("2025-09-15"), priority: "CRITICAL", status: "PENDING_REVIEW" },
    { title: "Update vehicle log book", description: "Enter pending journey logs for July", assignedToId: staff[4].id, assignedById: adminUser.id, dueDate: new Date("2025-08-05"), priority: "LOW", status: "OPEN" },
    { title: "Follow up SMC tender result", description: "Check tender opening results for SMC drainage work", assignedToId: staff[1].id, assignedById: adminUser.id, dueDate: new Date("2025-06-25"), priority: "HIGH", status: "COMPLETED", completedAt: new Date("2025-06-23") },
    { title: "Prepare RMC DPR proposal", description: "Draft proposal for RMC water supply DPR tender", assignedToId: staff[3].id, assignedById: adminUser.id, dueDate: new Date("2025-07-30"), priority: "MEDIUM", status: "ON_HOLD" },
  ];
  for (const t of tasks) {
    await prisma.task.create({ data: t });
  }
  console.log(`Seeded ${tasks.length} tasks`);

  console.log("Sample data seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
