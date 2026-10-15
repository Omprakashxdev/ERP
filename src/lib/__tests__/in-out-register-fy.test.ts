import { describe, it, expect } from "vitest";
import { getIndianFinancialYear } from "@/lib/date-utils";

describe("Indian Financial Year Auto-Detection", () => {
  it("detects 2026-27 for mid-year 2026 dates", () => {
    expect(getIndianFinancialYear("2026-10-15")).toBe("2026-27");
    expect(getIndianFinancialYear("2026-04-01")).toBe("2026-27");
    expect(getIndianFinancialYear("2026-12-31")).toBe("2026-27");
  });

  it("detects 2026-27 for Jan-March 2027 dates before April 1st", () => {
    expect(getIndianFinancialYear("2027-01-15")).toBe("2026-27");
    expect(getIndianFinancialYear("2027-02-28")).toBe("2026-27");
    expect(getIndianFinancialYear("2027-03-31")).toBe("2026-27");
  });

  it("automatically switches to 2027-28 on April 1st, 2027", () => {
    expect(getIndianFinancialYear("2027-04-01")).toBe("2027-28");
    expect(getIndianFinancialYear("2027-07-20")).toBe("2027-28");
    expect(getIndianFinancialYear("2027-12-31")).toBe("2027-28");
    expect(getIndianFinancialYear("2028-01-10")).toBe("2027-28");
    expect(getIndianFinancialYear("2028-03-31")).toBe("2027-28");
  });

  it("automatically switches to 2028-29 on April 1st, 2028", () => {
    expect(getIndianFinancialYear("2028-04-01")).toBe("2028-29");
  });
});
