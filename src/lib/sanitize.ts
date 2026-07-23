import { z } from "zod";

export function sanitizeInput(input: string): string {
  return input.trim().replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g, "");
}

export const emailSchema = z
  .string()
  .min(1, "Email is required")
  .email("Invalid email address")
  .toLowerCase()
  .trim()
  .transform(sanitizeInput);

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

export function scrubPii(text: string): string {
  return text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL]")
    .replace(/\b\d{10,12}\b/g, "[PHONE]")
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, "[CARD]");
}

export function withZod<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): z.infer<T> {
  return schema.parse(data);
}

// AI-specific PII scrubbing for Fund Flow data

interface ScrubContext {
  clients: Map<string, string>;
  projects: Map<string, string>;
  staff: Map<string, string>;
  contractors: Map<string, string>;
  regions: Map<string, string>;
}

function getOrCreatePlaceholder(
  map: Map<string, string>,
  key: string,
  prefix: string
): string {
  if (!map.has(key)) {
    map.set(key, `[${prefix}-${map.size + 1}]`);
  }
  return map.get(key)!;
}

export function scrubFundFlowForAi(rows: unknown[]): unknown[] {
  const context: ScrubContext = {
    clients: new Map(),
    projects: new Map(),
    staff: new Map(),
    contractors: new Map(),
    regions: new Map(),
  };

  return rows.map((row) => scrubRow(row, context));
}

function scrubRow(row: unknown, context: ScrubContext): unknown {
  if (row === null || typeof row !== "object") {
    return row;
  }

  const record = row as Record<string, unknown>;
  const scrubbed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    switch (key) {
      case "client":
      case "clientName":
      case "name":
        if (isStringRecord(value) && value.id) {
          scrubbed[key] = {
            ...value,
            name: getOrCreatePlaceholder(context.clients, value.id, "CLIENT"),
            abbreviation: value.abbreviation ? "[ABBR]" : value.abbreviation,
            address: value.address ? "[ADDRESS]" : value.address,
          };
        } else if (typeof value === "string") {
          scrubbed[key] = "[NAME]";
        } else {
          scrubbed[key] = value;
        }
        break;
      case "project":
      case "projectName":
        if (isStringRecord(value) && value.id) {
          scrubbed[key] = {
            ...value,
            name: getOrCreatePlaceholder(context.projects, value.id, "PROJECT"),
            address: value.address ? "[ADDRESS]" : value.address,
          };
        } else if (typeof value === "string") {
          scrubbed[key] = "[PROJECT]";
        } else {
          scrubbed[key] = value;
        }
        break;
      case "region":
      case "regionName":
        if (isStringRecord(value) && value.id) {
          scrubbed[key] = {
            ...value,
            name: getOrCreatePlaceholder(context.regions, value.id, "REGION"),
          };
        } else if (typeof value === "string") {
          scrubbed[key] = "[REGION]";
        } else {
          scrubbed[key] = value;
        }
        break;
      case "contractor":
      case "contractorName":
        if (isStringRecord(value) && value.id) {
          scrubbed[key] = {
            ...value,
            name: getOrCreatePlaceholder(
              context.contractors,
              value.id,
              "CONTRACTOR"
            ),
            contactPerson: value.contactPerson ? "[PERSON]" : value.contactPerson,
            email: value.email ? "[EMAIL]" : value.email,
            phone: value.phone ? "[PHONE]" : value.phone,
            address: value.address ? "[ADDRESS]" : value.address,
          };
        } else if (typeof value === "string") {
          scrubbed[key] = "[CONTRACTOR]";
        } else {
          scrubbed[key] = value;
        }
        break;
      case "staff":
      case "staffName":
        if (isStringRecord(value) && value.id) {
          scrubbed[key] = {
            ...value,
            name: getOrCreatePlaceholder(context.staff, value.id, "STAFF"),
            email: value.email ? "[EMAIL]" : value.email,
            phone: value.phone ? "[PHONE]" : value.phone,
          };
        } else if (typeof value === "string") {
          scrubbed[key] = "[STAFF]";
        } else {
          scrubbed[key] = value;
        }
        break;
      case "email":
        scrubbed[key] = typeof value === "string" ? "[EMAIL]" : value;
        break;
      case "phone":
        scrubbed[key] = typeof value === "string" ? "[PHONE]" : value;
        break;
      case "address":
        scrubbed[key] = typeof value === "string" ? "[ADDRESS]" : value;
        break;
      case "l1ContractorName":
      case "l2ContractorName":
      case "l3ContractorName":
        scrubbed[key] = typeof value === "string" ? "[CONTRACTOR]" : value;
        break;
      case "l1City":
      case "l2City":
      case "l3City":
        scrubbed[key] = typeof value === "string" ? "[CITY]" : value;
        break;
      case "platform":
        scrubbed[key] = typeof value === "string" ? "[PLATFORM]" : value;
        break;
      case "department":
        scrubbed[key] = typeof value === "string" ? "[DEPARTMENT]" : value;
        break;
      case "negotiationMeeting":
        scrubbed[key] =
          typeof value === "string" ? scrubPii(value) : value;
        break;
      case "assignments":
        if (Array.isArray(value)) {
          scrubbed[key] = value.map((item) => {
            const assignment = item as Record<string, unknown>;
            return {
              ...assignment,
              staff: assignment.staff
                ? scrubRow(assignment.staff, context)
                : assignment.staff,
            };
          });
        } else {
          scrubbed[key] = value;
        }
        break;
      default:
        if (typeof value === "string") {
          scrubbed[key] = scrubPii(value);
        } else if (Array.isArray(value)) {
          scrubbed[key] = value.map((item) =>
            typeof item === "string" ? scrubPii(item) : scrubRow(item, context)
          );
        } else if (typeof value === "object") {
          scrubbed[key] = scrubRow(value, context);
        } else {
          scrubbed[key] = value;
        }
    }
  }

  return scrubbed;
}

export function scrubDueBillsForAi(rows: unknown[]): unknown[] {
  return scrubFundFlowForAi(rows);
}

export function scrubWipForAi(rows: unknown[]): unknown[] {
  return scrubFundFlowForAi(rows);
}

export function scrubContractorsForAi(rows: unknown[]): unknown[] {
  return scrubFundFlowForAi(rows);
}

export function scrubTendersForAi(rows: unknown[]): unknown[] {
  return scrubFundFlowForAi(rows);
}

export function scrubPaymentSchedulesForAi(rows: unknown[]): unknown[] {
  return scrubFundFlowForAi(rows);
}

export function scrubVehicleLogBookForAi(rows: unknown[]): unknown[] {
  return scrubFundFlowForAi(rows);
}

export function scrubAssetsForAi(rows: unknown[]): unknown[] {
  return rows.map((row) => {
    if (row === null || typeof row !== "object") return row;
    const record = row as Record<string, unknown>;
    const scrubbed: Record<string, unknown> = { ...record };

    if (typeof scrubbed.itemCode === "string") {
      scrubbed.itemCode = "[ITEM_CODE]";
    }
    if (typeof scrubbed.name === "string") {
      scrubbed.name = "[ASSET_NAME]";
    }
    if (typeof scrubbed.category === "string") {
      scrubbed.category = "[CATEGORY]";
    }
    if (typeof scrubbed.make === "string") {
      scrubbed.make = "[MAKE]";
    }
    if (typeof scrubbed.model === "string") {
      scrubbed.model = "[MODEL]";
    }
    if (typeof scrubbed.securityCode === "string") {
      scrubbed.securityCode = "[SECURITY_CODE]";
    }
    if (typeof scrubbed.assignee === "string") {
      scrubbed.assignee = "[ASSIGNEE]";
    }
    if (typeof scrubbed.responsiblePerson === "string") {
      scrubbed.responsiblePerson = "[RESPONSIBLE_PERSON]";
    }
    if (typeof scrubbed.remarks === "string") {
      scrubbed.remarks = scrubPii(scrubbed.remarks);
    }

    return scrubbed;
  });
}

export function scrubInOutRegisterForAi(rows: unknown[]): unknown[] {
  return rows.map((row) => {
    if (row === null || typeof row !== "object") return row;
    const record = row as Record<string, unknown>;
    const scrubbed: Record<string, unknown> = { ...record };

    if (typeof scrubbed.documentRefNo === "string") {
      scrubbed.documentRefNo = "[DOC_REF]";
    }
    if (typeof scrubbed.replyRefNo === "string") {
      scrubbed.replyRefNo = "[REPLY_REF]";
    }
    if (typeof scrubbed.details === "string") {
      scrubbed.details = scrubPii(scrubbed.details);
    }
    if (typeof scrubbed.ccStaffNames === "string") {
      scrubbed.ccStaffNames = "[CC_STAFF]";
    }

    if (isStringRecord(scrubbed.client) && scrubbed.client.id) {
      scrubbed.client = {
        ...scrubbed.client,
        name: "[CLIENT]",
        abbreviation: scrubbed.client.abbreviation ? "[ABBR]" : null,
        address: scrubbed.client.address ? "[ADDRESS]" : null,
      };
    }

    if (
      isStringRecord(scrubbed.actionSuggestedStaff) &&
      scrubbed.actionSuggestedStaff.id
    ) {
      scrubbed.actionSuggestedStaff = {
        ...scrubbed.actionSuggestedStaff,
        name: "[STAFF]",
        email: scrubbed.actionSuggestedStaff.email ? "[EMAIL]" : null,
        phone: scrubbed.actionSuggestedStaff.phone ? "[PHONE]" : null,
      };
    }

    if (Array.isArray(scrubbed.documents)) {
      scrubbed.documents = scrubbed.documents.map((item) => {
        if (isStringRecord(item) && typeof item.path === "string") {
          return { ...item, path: "[DOCUMENT_PATH]" };
        }
        return item;
      });
    }

    if (Array.isArray(scrubbed.ccStaff)) {
      scrubbed.ccStaff = scrubbed.ccStaff.map((item) => {
        const relation = item as Record<string, unknown>;
        if (isStringRecord(relation.staff) && relation.staff.id) {
          return {
            ...relation,
            staff: {
              ...relation.staff,
              name: "[STAFF]",
              email: relation.staff.email ? "[EMAIL]" : null,
              phone: relation.staff.phone ? "[PHONE]" : null,
            },
          };
        }
        return relation;
      });
    }

    return scrubbed;
  });
}

export function scrubTadaClaimsForAi(rows: unknown[]): unknown[] {
  return rows.map((row) => {
    if (row === null || typeof row !== "object") return row;
    const record = row as Record<string, unknown>;
    const scrubbed: Record<string, unknown> = { ...record };

    if (typeof scrubbed.tourPurpose === "string") {
      scrubbed.tourPurpose = scrubPii(scrubbed.tourPurpose);
    }
    if (typeof scrubbed.location === "string") {
      scrubbed.location = "[LOCATION]";
    }
    if (typeof scrubbed.billCopyPath === "string") {
      scrubbed.billCopyPath = "[FILE_PATH]";
    }
    if (typeof scrubbed.managerRemarks === "string") {
      scrubbed.managerRemarks = scrubPii(scrubbed.managerRemarks);
    }
    if (typeof scrubbed.accountsRemarks === "string") {
      scrubbed.accountsRemarks = scrubPii(scrubbed.accountsRemarks);
    }
    if (typeof scrubbed.financeRemarks === "string") {
      scrubbed.financeRemarks = scrubPii(scrubbed.financeRemarks);
    }
    if (typeof scrubbed.paymentMode === "string") {
      scrubbed.paymentMode = "[PAYMENT_MODE]";
    }

    if (isStringRecord(scrubbed.staff) && scrubbed.staff.id) {
      scrubbed.staff = {
        ...scrubbed.staff,
        name: "[STAFF]",
        email: scrubbed.staff.email ? "[EMAIL]" : null,
        phone: scrubbed.staff.phone ? "[PHONE]" : null,
      };
    }

    return scrubbed;
  });
}

export function scrubTasksForAi(rows: unknown[]): unknown[] {
  return rows.map((row) => {
    if (row === null || typeof row !== "object") return row;
    const record = row as Record<string, unknown>;
    const scrubbed: Record<string, unknown> = { ...record };

    if (typeof scrubbed.title === "string") {
      scrubbed.title = scrubPii(scrubbed.title);
    }
    if (typeof scrubbed.description === "string") {
      scrubbed.description = scrubPii(scrubbed.description);
    }
    if (typeof scrubbed.reworkReason === "string") {
      scrubbed.reworkReason = scrubPii(scrubbed.reworkReason);
    }

    if (isStringRecord(scrubbed.assignedTo) && scrubbed.assignedTo.id) {
      scrubbed.assignedTo = {
        ...scrubbed.assignedTo,
        name: "[STAFF]",
        email: scrubbed.assignedTo.email ? "[EMAIL]" : null,
        phone: scrubbed.assignedTo.phone ? "[PHONE]" : null,
      };
    }

    if (isStringRecord(scrubbed.assignedBy) && scrubbed.assignedBy.id) {
      scrubbed.assignedBy = {
        ...scrubbed.assignedBy,
        name: "[STAFF]",
        email: scrubbed.assignedBy.email ? "[EMAIL]" : null,
        phone: scrubbed.assignedBy.phone ? "[PHONE]" : null,
      };
    }

    if (isStringRecord(scrubbed.project) && scrubbed.project.id) {
      scrubbed.project = {
        ...scrubbed.project,
        name: "[PROJECT]",
      };
    }

    return scrubbed;
  });
}

function isStringRecord(value: unknown): value is Record<string, string | null | undefined> {
  return typeof value === "object" && value !== null;
}
