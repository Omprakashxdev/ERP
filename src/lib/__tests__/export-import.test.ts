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

describe("Brick 4 — UTF-8 BOM & Gujarati export", () => {
  const config = MODULE_EXPORT_CONFIGS.inOutRegister;
  const rows = [
    {
      documentRefNo: "SAEC/IN/001",
      details: "ગુજરાતી દસ્તાવેજ",
      letterPad: "Letter pad - અમદાવાદ",
      direction: "INWARD",
      receivedByPersonName: "આવક જાવક રજિસ્ટર",
      department: "કાર્યવાહી જરૂરી",
      remarks: 'Mixed, "quoted" text\nwith newline',
      emptyField: "",
      amount: "12500.50",
    },
  ];

  it("CSV begins with exactly one UTF-8 BOM (EF BB BF)", async () => {
    const { rowsToCsv, CSV_BOM } = await import("@/lib/export-import");
    const csv = rowsToCsv(rows as never, config);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.indexOf(CSV_BOM)).toBe(0);
    expect(csv.indexOf(CSV_BOM, 1)).toBe(-1);
    const bytes = new TextEncoder().encode(csv);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("preserves Gujarati, Hindi, mixed-language text in exported CSV", async () => {
    const { rowsToCsv } = await import("@/lib/export-import");
    const csv = rowsToCsv(rows as never, config);
    expect(csv).toContain("ગુજરાતી દસ્તાવેજ");
    expect(csv).toContain("Letter pad - અમદાવાદ");
    expect(csv).toContain("કાર્યવાહી જરૂરી");
    expect(csv).not.toContain("�"); // no replacement chars / double encoding
  });

  it("escapes commas, quotes and newlines correctly", async () => {
    const { rowsToCsv } = await import("@/lib/export-import");
    const csv = rowsToCsv(rows as never, config);
    expect(csv).toContain('"Mixed, ""quoted"" text\nwith newline"');
  });

  it("parseCsv strips a leading BOM so the first header is clean", () => {
    const withBom = "\uFEFFname,phone\nJohn,123";
    const rows2 = parseCsv(withBom);
    expect(rows2[0].name).toBe("John");
    expect(Object.keys(rows2[0])[0]).toBe("name");
    // and non-BOM input still works
    expect(parseCsv("name,phone\nJohn,123")[0].name).toBe("John");
  });

  it("round-trip: Gujarati value → CSV → parseCsv → identical string", async () => {
    const { rowsToCsv } = await import("@/lib/export-import");
    const src = [{ documentRefNo: "X/1", details: "આવક જાવક રજિસ્ટર" }];
    const csv = rowsToCsv(src as never, config);
    const parsed = parseCsv(csv);
    expect(parsed[0].details).toBe("આવક જાવક રજિસ્ટર");
    expect(parsed[0].documentRefNo).toBe("X/1");
  });

  it("does not corrupt numbers or date-shaped strings", async () => {
    const { rowsToCsv } = await import("@/lib/export-import");
    const csv = rowsToCsv(
      [{ documentRefNo: "X/2", details: "note", remarks: "-1250.75", amount: "40000" }] as never,
      config
    );
    const parsed = parseCsv(csv);
    expect(parsed[0].remarks).toBe("-1250.75");
    expect(parsed[0].amount).toBe("40000");
  });
});

describe("Brick 4 — spreadsheet formula-injection safety", () => {
  const config = MODULE_EXPORT_CONFIGS.inOutRegister;

  it("prefixes =, +, -, @ formula-leading text with an apostrophe in the raw output", async () => {
    const { rowsToCsv } = await import("@/lib/export-import");
    const csv = rowsToCsv(
      [
        { documentRefNo: "=cmd|'/c calc'!A1", details: "=1+1" },
        { documentRefNo: "@SUM(1)", details: "+danger" },
      ] as never,
      config
    );
    expect(csv).toContain("'=cmd|'/c calc'!A1");
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'@SUM(1)");
    expect(csv).toContain("'+danger");
  });

  it("round-trips guarded values back to the original stored text", async () => {
    const { rowsToCsv } = await import("@/lib/export-import");
    const csv = rowsToCsv(
      [
        { documentRefNo: "=cmd|'/c calc'!A1", details: "=1+1" },
        { documentRefNo: "@SUM(1)", details: "+danger" },
      ] as never,
      config
    );
    const parsed = parseCsv(csv);
    expect(parsed[0].documentRefNo).toBe("=cmd|'/c calc'!A1");
    expect(parsed[0].details).toBe("=1+1");
    expect(parsed[1].documentRefNo).toBe("@SUM(1)");
    expect(parsed[1].details).toBe("+danger");
  });

  it("guards formula chars preceded by spaces, tabs and carriage returns", async () => {
    const { rowsToCsv } = await import("@/lib/export-import");
    const csv = rowsToCsv(
      [
        { details: "  =1+1" },
        { details: "\t=cmd" },
        { details: "\r+HYPERLINK(1)" },
        { details: "   @x" },
      ] as never,
      config
    );
    expect(csv).toContain("'  =1+1");
    expect(csv).toContain("'\t=cmd");
    expect(csv).toContain("'\r+HYPERLINK(1)");
    expect(csv).toContain("'   @x");
    const parsed = parseCsv(csv);
    expect(parsed[0].details).toBe("  =1+1");
    expect(parsed[1].details).toBe("\t=cmd");
    expect(parsed[2].details).toBe("\r+HYPERLINK(1)");
    expect(parsed[3].details).toBe("   @x");
  });

  it("does NOT prefix legitimate negative/positive numbers", async () => {
    const { rowsToCsv } = await import("@/lib/export-import");
    const csv = rowsToCsv([{ remarks: "-500", details: "+2.5" }] as never, config);
    const parsed = parseCsv(csv);
    expect(parsed[0].remarks).toBe("-500");
    expect(parsed[0].details).toBe("+2.5");
    expect(csv).not.toContain("'-500");
    expect(csv).not.toContain("'+2.5");
  });

  it("distinguishes user-authored apostrophes from export-added guards", async () => {
    const { rowsToCsv } = await import("@/lib/export-import");
    const csv = rowsToCsv(
      [
        { details: "'=user formula" }, // stored literal apostrophe + formula
        { details: "'plain note" },    // stored literal apostrophe
        { details: "=real danger" },   // gets the export guard
      ] as never,
      config
    );
    const parsed = parseCsv(csv);
    expect(parsed[0].details).toBe("'=user formula");
    expect(parsed[1].details).toBe("'plain note");
    expect(parsed[2].details).toBe("=real danger");
    // a user-supplied CSV apostrophe that was never doubled stays intact
    const external = parseCsv("id,details\nx,'hello\ny,'=typed\n");
    expect(external[0].details).toBe("'hello");
    expect(external[1].details).toBe("=typed");
  });

  it("round-trips fields containing embedded newlines, commas and quotes", async () => {
    const { rowsToCsv } = await import("@/lib/export-import");
    const csv = rowsToCsv(
      [
        {
          documentRefNo: "X/9",
          details: "line one\nline two, with \"quotes\"",
          remarks: "plain",
        },
      ] as never,
      config
    );
    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].details).toBe('line one\nline two, with "quotes"');
    expect(parsed[0].remarks).toBe("plain");
  });
});

describe("Brick 4 — XLSX export preserves Unicode", () => {
  it("xlsx output is a valid workbook containing Gujarati cells", async () => {
    const { rowsToXlsx } = await import("@/lib/export-import");
    const XLSX = await import("xlsx");
    const buf = rowsToXlsx(
      [
        {
          documentRefNo: "SAEC/IN/7",
          details: "ગુજરાતી દસ્તાવેજ",
          letterPad: "Letter pad - અમદાવાદ",
        },
      ] as never,
      MODULE_EXPORT_CONFIGS.inOutRegister
    );
    // zip magic
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const parsed = XLSX.utils.sheet_to_json<Record<string, string>>(ws);
    expect(parsed[0].details).toBe("ગુજરાતી દસ્તાવેજ");
    expect(parsed[0].letterPad).toBe("Letter pad - અમદાવાદ");
    expect(parsed[0].documentRefNo).toBe("SAEC/IN/7");
  });
});
