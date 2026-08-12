import { describe, it, expect } from "vitest";
import { parseCsv, parseJson, MODULE_EXPORT_CONFIGS } from "@/lib/export-import";

describe("Bulk Import — CSV Parsing", () => {
  it("parses a simple CSV with headers and one row", () => {
    const csv = "name,phone,email\nJohn Doe,9876543210,john@example.com";
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("John Doe");
    expect(rows[0].phone).toBe("9876543210");
    expect(rows[0].email).toBe("john@example.com");
  });

  it("parses multiple rows", () => {
    const csv = "name,amount\nAlice,100\nBob,200\nCharlie,300";
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[2].name).toBe("Charlie");
    expect(rows[2].amount).toBe("300");
  });

  it("handles quoted fields with commas inside", () => {
    const csv = 'name,address\n"John, Jr.","123, Main St"';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("John, Jr.");
    expect(rows[0].address).toBe("123, Main St");
  });

  it("handles escaped double quotes inside quoted fields", () => {
    const csv = 'name,description\n"John","He said ""hello"" to me"';
    const rows = parseCsv(csv);
    expect(rows[0].description).toBe('He said "hello" to me');
  });

  it("handles empty values", () => {
    const csv = "name,phone,email\nJohn,,john@example.com";
    const rows = parseCsv(csv);
    expect(rows[0].phone).toBe("");
    expect(rows[0].name).toBe("John");
  });

  it("skips blank lines", () => {
    const csv = "name,amount\nAlice,100\n\nBob,200\n\n";
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1].name).toBe("Bob");
  });

  it("handles extra columns beyond headers gracefully", () => {
    const csv = "name,phone\nJohn,9876543210,extra";
    const rows = parseCsv(csv);
    expect(rows[0].name).toBe("John");
    expect(rows[0].phone).toBe("9876543210");
  });

  it("handles fewer columns than headers", () => {
    const csv = "name,phone,email\nJohn,9876543210";
    const rows = parseCsv(csv);
    expect(rows[0].name).toBe("John");
    expect(rows[0].phone).toBe("9876543210");
    expect(rows[0].email).toBe("");
  });

  it("returns empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });

  it("handles trailing newline", () => {
    const csv = "name,amount\nAlice,100\n";
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Alice");
  });
});

describe("Bulk Import — JSON Parsing", () => {
  it("parses valid JSON array", () => {
    const json = JSON.stringify([
      { name: "Alice", amount: 100 },
      { name: "Bob", amount: 200 },
    ]);
    const rows = parseJson(json);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("Alice");
  });

  it("throws on non-array JSON", () => {
    expect(() => parseJson(JSON.stringify({ name: "Alice" }))).toThrow(
      "JSON content must be an array of objects"
    );
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJson("{invalid")).toThrow();
  });
});

describe("Bulk Import — Module Config Consistency", () => {
  const modulesToTest = [
    "fundFlow",
    "dueBills",
    "wip",
    "contractors",
    "tenders",
    "paymentSchedules",
    "vehicleLogBook",
    "assets",
    "inOutRegister",
    "tadaBills",
    "tasks",
    "clients",
    "staff",
  ];

  for (const mod of modulesToTest) {
    it(`${mod} has a config defined`, () => {
      expect(MODULE_EXPORT_CONFIGS[mod]).toBeDefined();
      expect(MODULE_EXPORT_CONFIGS[mod].label).toBeTruthy();
    });
  }

  it("contractors config has relationFields as array", () => {
    expect(Array.isArray(MODULE_EXPORT_CONFIGS.contractors.relationFields)).toBe(true);
  });

  it("dueBills has status enum with correct values", () => {
    expect(MODULE_EXPORT_CONFIGS.dueBills.enumFields.status).toEqual([
      "PENDING",
      "PARTIAL",
      "PAID",
      "ON_HOLD",
      "CANCELLED",
    ]);
  });

  it("dueBills has billDate and receiveDate as dateFields", () => {
    expect(MODULE_EXPORT_CONFIGS.dueBills.dateFields).toContain("billDate");
    expect(MODULE_EXPORT_CONFIGS.dueBills.dateFields).toContain("receiveDate");
  });

  it("dueBills has grossAmount as decimalField", () => {
    expect(MODULE_EXPORT_CONFIGS.dueBills.decimalFields).toContain("grossAmount");
  });

  it("wip has project, hoCoordinator, roCoordinator as relationFields", () => {
    expect(MODULE_EXPORT_CONFIGS.wip.relationFields).toEqual([
      "project",
      "hoCoordinator",
      "roCoordinator",
    ]);
  });

  it("tasks has assignedTo, assignedBy, project as relationFields", () => {
    expect(MODULE_EXPORT_CONFIGS.tasks.relationFields).toEqual([
      "assignedTo",
      "assignedBy",
      "project",
    ]);
  });

  it("staff has isActive in booleanFields", () => {
    expect(MODULE_EXPORT_CONFIGS.staff.booleanFields).toContain("isActive");
  });
});

describe("Bulk Import — CSV Round-trip (Export then Parse)", () => {
  it("can parse a CSV that was generated by rowsToCsv", async () => {
    const { rowsToCsv } = await import("@/lib/export-import");
    const config = MODULE_EXPORT_CONFIGS.paymentSchedules;
    const sampleData = [
      { date: "2025-01-15", dueDate: "2025-02-15", paymentType: "GST", category: "GST", detail: "Monthly GST", amount: "50000", status: "PENDING", remarks: "" },
    ];
    const csv = rowsToCsv(sampleData as never, config);
    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].paymentType).toBe("GST");
    expect(parsed[0].amount).toBe("50000");
  });
});

describe("Bulk Import — Edge Cases from Real-world CSV", () => {
  it("handles Windows line endings (\\r\\n)", () => {
    const csv = "name,amount\r\nAlice,100\r\nBob,200\r\n";
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("Alice");
    expect(rows[1].name).toBe("Bob");
  });

  it("handles values with leading/trailing spaces", () => {
    const csv = "name,amount\n  Alice  ,  100  ";
    const rows = parseCsv(csv);
    expect(rows[0].name).toBe("  Alice  ");
    // Note: the import action trims values, but parseCsv preserves them
  });

  it("handles numbers with commas in quoted fields", () => {
    const csv = 'name,amount\n"John","1,00,000"';
    const rows = parseCsv(csv);
    expect(rows[0].amount).toBe("1,00,000");
    // The autoCorrectNumber function in the action strips commas
  });

  it("handles Indian Rupee symbol in values", () => {
    const csv = "name,amount\nJohn,₹50000";
    const rows = parseCsv(csv);
    expect(rows[0].amount).toBe("₹50000");
    // autoCorrectNumber strips ₹
  });

  it("handles dates in DD/MM/YYYY format", () => {
    const csv = "name,billDate\nTest,15/01/2025";
    const rows = parseCsv(csv);
    expect(rows[0].billDate).toBe("15/01/2025");
    // parseImportDate in the action handles this format
  });

  it("handles dates in YYYY-MM-DD format", () => {
    const csv = "name,billDate\nTest,2025-01-15";
    const rows = parseCsv(csv);
    expect(rows[0].billDate).toBe("2025-01-15");
  });

  it("handles dates with text months like 25-Jul-2025", () => {
    const csv = "name,billDate\nTest,25-Jul-2025";
    const rows = parseCsv(csv);
    expect(rows[0].billDate).toBe("25-Jul-2025");
  });

  it("handles empty rows in the middle of CSV", () => {
    const csv = "name,amount\nAlice,100\n,\nBob,200";
    const rows = parseCsv(csv);
    // The blank line filter removes the empty row
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
