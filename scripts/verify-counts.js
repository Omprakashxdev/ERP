const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const tables = [
    "User", "Staff", "Client", "Project", "Contractor", "Tender",
    "Vehicle", "Asset", "InOutRegister", "Task", "TadaClaim",
    "State", "City", "Department", "Designation", "AuditLog",
    "PaymentSchedule", "Region", "Notification", "RolePermission",
    "RegistrationRequest", "NotificationRule",
  ];

  for (const t of tables) {
    const key = t.charAt(0).toLowerCase() + t.slice(1);
    try {
      const count = await p[key].count();
      console.log(`${t}: ${count}`);
    } catch {
      console.log(`${t}: (error or table not found)`);
    }
  }

  await p.$disconnect();
})();
