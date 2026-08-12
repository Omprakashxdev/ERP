import { describe, it, expect } from "vitest";
import { parseCsv } from "@/lib/export-import";

// These tests replicate the logic of the private functions in export-import.ts action
// (parseImportDate, autoCorrectNumber, autoCorrectEnum) to verify the import pipeline
// behavior without needing a database connection.

function parseImportDate(value: string): Date | null {
  if (!value || value.trim() === "") return null;
  const trimmed = value.trim();

  // Try ISO / YYYY-MM-DD — only trust new Date() for ISO-like formats
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  let d: Date;

  const parts1 = trimmed.split(/[\/\-]/);
  if (parts1.length === 3) {
    const day = parseInt(parts1[0], 10);
    const month = parseInt(parts1[1], 10) - 1;
    let year = parseInt(parts1[2], 10);
    if (year < 100) year += 2000;
    d = new Date(year, month, day);
    if (!isNaN(d.getTime()) && d.getDate() === day && d.getMonth() === month) return d;
  }

  if (parts1.length === 3) {
    const month = parseInt(parts1[0], 10) - 1;
    const day = parseInt(parts1[1], 10);
    let year = parseInt(parts1[2], 10);
    if (year < 100) year += 2000;
    d = new Date(year, month, day);
    if (!isNaN(d.getTime()) && d.getDate() === day && d.getMonth() === month) return d;
  }

  const textMonthMatch = trimmed.match(/(\d{1,2})[\s\-]([A-Za-z]{3,})[\s\-](\d{2,4})/);
  if (textMonthMatch) {
    const day = parseInt(textMonthMatch[1], 10);
    const monthStr = textMonthMatch[2].charAt(0).toUpperCase() + textMonthMatch[2].slice(1).toLowerCase();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months.indexOf(monthStr);
    let year = parseInt(textMonthMatch[3], 10);
    if (year < 100) year += 2000;
    if (month >= 0) {
      d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const textMonthMatch2 = trimmed.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (textMonthMatch2) {
    const monthStr = textMonthMatch2[1].charAt(0).toUpperCase() + textMonthMatch2[1].slice(1).toLowerCase();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months.indexOf(monthStr);
    const day = parseInt(textMonthMatch2[2], 10);
    let year = parseInt(textMonthMatch2[3], 10);
    if (year < 100) year += 2000;
    if (month >= 0) {
      d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

function autoCorrectNumber(value: string): string {
  let corrected = value.replace(/[\u20B9]/g, "").replace(/Rs\.?/gi, "").replace(/,/g, "").replace(/\s/g, "");
  if (/^\(.+\)$/.test(corrected)) {
    corrected = "-" + corrected.slice(1, -1);
  }
  return corrected;
}

function autoCorrectEnum(value: string, allowed: string[]): string | null {
  const normalized = value.toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (allowed.includes(normalized)) return normalized;
  if (allowed.includes(value)) return value;

  const lower = value.toLowerCase().replace(/\s+/g, "_");
  for (const candidate of allowed) {
    const candidateLower = candidate.toLowerCase();
    if (candidateLower === lower) return candidate;
    if (candidateLower.startsWith(lower) || lower.startsWith(candidateLower)) return candidate;
  }

  const aliases: Record<string, string> = {
    "yes": "PAID",
    "no": "PENDING",
    "done": "COMPLETED",
    "complete": "COMPLETED",
    "cancel": "CANCELLED",
    "cancelled": "CANCELLED",
    "active": "ACTIVE",
    "inactive": "INACTIVE",
    "hold": "ON_HOLD",
    "on_hold": "ON_HOLD",
    "in_progress": "IN_PROGRESS",
    "progress": "IN_PROGRESS",
    "wip": "IN_PROGRESS",
    "open": "OPEN",
    "close": "COMPLETED",
    "closed": "COMPLETED",
    "reject": "REJECTED",
    "rejected": "REJECTED",
    "submit": "SUBMITTED",
    "submitted": "SUBMITTED",
    "approve": "MANAGER_APPROVED",
    "approved": "MANAGER_APPROVED",
  };
  const alias = aliases[lower];
  if (alias && allowed.includes(alias)) return alias;

  return null;
}

describe("Bulk Import — Date Parsing (parseImportDate)", () => {
  it("parses ISO format YYYY-MM-DD", () => {
    const d = parseImportDate("2025-01-15");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(0); // January
    expect(d!.getDate()).toBe(15);
  });

  it("parses DD/MM/YYYY format", () => {
    const d = parseImportDate("15/01/2025");
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(15);
    expect(d!.getMonth()).toBe(0);
    expect(d!.getFullYear()).toBe(2025);
  });

  it("parses DD-MM-YYYY format", () => {
    const d = parseImportDate("15-01-2025");
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(15);
  });

  it("parses MM/DD/YYYY format", () => {
    const d = parseImportDate("01/15/2025");
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(0);
    expect(d!.getDate()).toBe(15);
  });

  it("parses 2-digit year DD/MM/YY", () => {
    const d = parseImportDate("15/01/25");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2025);
  });

  it("parses text month format 25-Jul-2025", () => {
    const d = parseImportDate("25-Jul-2025");
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(25);
    expect(d!.getMonth()).toBe(6); // July
  });

  it("parses text month format Jul 25, 2025", () => {
    const d = parseImportDate("Jul 25, 2025");
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(25);
    expect(d!.getMonth()).toBe(6);
  });

  it("parses text month format Jul 25 2025 (no comma)", () => {
    const d = parseImportDate("Jul 25 2025");
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(25);
  });

  it("returns null for empty string", () => {
    expect(parseImportDate("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseImportDate("   ")).toBeNull();
  });

  it("returns null for invalid date", () => {
    expect(parseImportDate("not-a-date")).toBeNull();
  });

  it("returns null for 32/01/2025 (invalid day)", () => {
    expect(parseImportDate("32/01/2025")).toBeNull();
  });

  it("handles whitespace around date", () => {
    const d = parseImportDate("  2025-01-15  ");
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(15);
  });
});

describe("Bulk Import — Number Auto-Correction (autoCorrectNumber)", () => {
  it("strips Indian Rupee symbol", () => {
    expect(autoCorrectNumber("₹50000")).toBe("50000");
  });

  it("strips Rs prefix", () => {
    expect(autoCorrectNumber("Rs.50000")).toBe("50000");
    expect(autoCorrectNumber("Rs 50000")).toBe("50000");
    expect(autoCorrectNumber("rs50000")).toBe("50000");
  });

  it("strips commas from Indian number format", () => {
    expect(autoCorrectNumber("1,00,000")).toBe("100000");
    expect(autoCorrectNumber("12,34,567")).toBe("1234567");
  });

  it("strips spaces", () => {
    expect(autoCorrectNumber(" 50,000 ")).toBe("50000");
  });

  it("handles negative in parentheses", () => {
    expect(autoCorrectNumber("(100.50)")).toBe("-100.50");
  });

  it("preserves decimal points", () => {
    expect(autoCorrectNumber("50000.50")).toBe("50000.50");
  });

  it("handles combined Rs + commas + symbol", () => {
    expect(autoCorrectNumber("₹1,00,000.50")).toBe("100000.50");
  });

  it("passes through plain numbers", () => {
    expect(autoCorrectNumber("50000")).toBe("50000");
  });
});

describe("Bulk Import — Enum Auto-Correction (autoCorrectEnum)", () => {
  const dueBillStatuses = ["PENDING", "PARTIAL", "PAID", "ON_HOLD", "CANCELLED"];

  it("passes through correct uppercase value", () => {
    expect(autoCorrectEnum("PENDING", dueBillStatuses)).toBe("PENDING");
  });

  it("normalizes lowercase to uppercase", () => {
    expect(autoCorrectEnum("pending", dueBillStatuses)).toBe("PENDING");
  });

  it("normalizes spaces to underscores", () => {
    expect(autoCorrectEnum("ON HOLD", dueBillStatuses)).toBe("ON_HOLD");
  });

  it("normalizes hyphens to underscores", () => {
    expect(autoCorrectEnum("ON-HOLD", dueBillStatuses)).toBe("ON_HOLD");
  });

  it("maps 'yes' alias to PAID", () => {
    expect(autoCorrectEnum("yes", dueBillStatuses)).toBe("PAID");
  });

  it("maps 'no' alias to PENDING", () => {
    expect(autoCorrectEnum("no", dueBillStatuses)).toBe("PENDING");
  });

  it("maps 'cancel' alias to CANCELLED", () => {
    expect(autoCorrectEnum("cancel", dueBillStatuses)).toBe("CANCELLED");
  });

  it("maps 'hold' alias to ON_HOLD", () => {
    expect(autoCorrectEnum("hold", dueBillStatuses)).toBe("ON_HOLD");
  });

  it("does partial match — 'pend' matches PENDING", () => {
    expect(autoCorrectEnum("pend", dueBillStatuses)).toBe("PENDING");
  });

  it("returns null for unrecognized value", () => {
    expect(autoCorrectEnum("unknown", dueBillStatuses)).toBeNull();
  });

  it("handles task statuses", () => {
    const taskStatuses = ["OPEN", "IN_PROGRESS", "PENDING_REVIEW", "COMPLETED", "ON_HOLD", "CANCELLED"];
    expect(autoCorrectEnum("in progress", taskStatuses)).toBe("IN_PROGRESS");
    expect(autoCorrectEnum("completed", taskStatuses)).toBe("COMPLETED");
    expect(autoCorrectEnum("open", taskStatuses)).toBe("OPEN");
  });

  it("handles tender statuses", () => {
    const tenderStatuses = ["UNDER_PREPARATION", "SUBMITTED", "UNDER_EVALUATION", "WON", "LOST", "WITHDRAWN", "CANCELLED"];
    expect(autoCorrectEnum("won", tenderStatuses)).toBe("WON");
    expect(autoCorrectEnum("lost", tenderStatuses)).toBe("LOST");
    expect(autoCorrectEnum("under preparation", tenderStatuses)).toBe("UNDER_PREPARATION");
  });

  it("handles TADA claim statuses", () => {
    const tadaStatuses = ["DRAFT", "SUBMITTED", "MANAGER_APPROVED", "ACCOUNTS_VERIFIED", "FINANCE_APPROVED", "PAID", "REJECTED"];
    expect(autoCorrectEnum("draft", tadaStatuses)).toBe("DRAFT");
    expect(autoCorrectEnum("approved", tadaStatuses)).toBe("MANAGER_APPROVED");
    expect(autoCorrectEnum("rejected", tadaStatuses)).toBe("REJECTED");
  });
});

describe("Bulk Import — Full Pipeline Simulation (CSV → Parsed Data)", () => {
  it("simulates importing a payment schedule row", () => {
    const csv = 'date,dueDate,paymentType,category,detail,amount,status,remarks\n2025-01-15,2025-02-15,GST Payment,GST,Monthly GST,"₹50,000",PENDING,';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.date).toBe("2025-01-15");
    expect(row.paymentType).toBe("GST Payment");
    expect(row.amount).toBe("₹50,000");

    // Simulate what the action does:
    const date = parseImportDate(row.date);
    expect(date).not.toBeNull();
    expect(date!.getDate()).toBe(15);

    const correctedAmount = autoCorrectNumber(row.amount);
    expect(parseFloat(correctedAmount)).toBe(50000);

    const correctedStatus = autoCorrectEnum(row.status, ["PENDING", "PAID", "OVERDUE", "CANCELLED"]);
    expect(correctedStatus).toBe("PENDING");
  });

  it("simulates importing a due bill row with Indian date format", () => {
    const csv = 'project,scheme,grossAmount,sgst,cgst,billAmount,chequeAmount,sd,itTds,receivedAmount,billDate,receiveDate,status,remarks\nProject Alpha,GST,"₹1,00,000",9000,9000,118000,100000,5000,2000,95000,15/01/2025,20/01/2025,PENDING,';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);

    const row = rows[0];
    const billDate = parseImportDate(row.billDate);
    expect(billDate).not.toBeNull();
    expect(billDate!.getDate()).toBe(15);
    expect(billDate!.getMonth()).toBe(0);

    const grossAmount = autoCorrectNumber(row.grossAmount);
    expect(parseFloat(grossAmount)).toBe(100000);

    const status = autoCorrectEnum(row.status, ["PENDING", "PARTIAL", "PAID", "ON_HOLD", "CANCELLED"]);
    expect(status).toBe("PENDING");
  });

  it("simulates importing a contractor with special characters", () => {
    const csv = 'name,contactPerson,phone,email,address,contractAmount,agreementDate,workOrderDate,workName,workType,serviceType,scheduleBAmount,finalProgressAmount\n"ABC, Inc","Jane, Doe",9876543210,jane@abc.com,"123, Main St","₹5,00,000",15-01-2025,01-02-2025,Building Construction,BUILDING,CONSULTANCY,100000,50000';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.name).toBe("ABC, Inc");
    expect(row.contactPerson).toBe("Jane, Doe");
    expect(row.address).toBe("123, Main St");

    const agreementDate = parseImportDate(row.agreementDate);
    expect(agreementDate).not.toBeNull();
    expect(agreementDate!.getDate()).toBe(15);

    const contractAmount = autoCorrectNumber(row.contractAmount);
    expect(parseFloat(contractAmount)).toBe(500000);
  });
});
