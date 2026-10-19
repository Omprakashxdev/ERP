import { describe, it, expect } from "vitest";
import { documentDisplayName } from "@/components/ui/file-upload-field";

describe("documentDisplayName", () => {
  it("strips the storage directory, showing only the filename", () => {
    expect(documentDisplayName("/uploads/wip/ra1.pdf")).toBe("ra1.pdf");
  });

  it("strips the server-generated timestamp prefix", () => {
    expect(documentDisplayName("/uploads/wip/1729000000123_ra1.pdf")).toBe("ra1.pdf");
  });

  it("keeps the basename for manually-entered paths", () => {
    expect(documentDisplayName("C:\\scans\\cert.pdf")).toBe("cert.pdf");
    expect(documentDisplayName("plain-doc.pdf")).toBe("plain-doc.pdf");
  });

  it("decodes URI-encoded names and tolerates odd input", () => {
    expect(documentDisplayName("/uploads/x/my%20file.pdf")).toBe("my file.pdf");
    expect(documentDisplayName("")).toBe("");
  });

  it("does not strip short numeric prefixes that are real filenames", () => {
    expect(documentDisplayName("/uploads/x/12345_scan.pdf")).toBe("12345_scan.pdf");
  });
});
