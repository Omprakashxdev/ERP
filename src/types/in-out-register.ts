import { InOutRegister, Client, Staff, ModeMaster, InOutRegisterDocument, InOutRegisterCcStaff } from "@prisma/client";

export type InOutRegisterListRow = InOutRegister & {
  client: Client;
  actionSuggestedStaff: Staff | null;
  mode?: Pick<ModeMaster, "id" | "name" | "isActive"> | null;
  documents: InOutRegisterDocument[];
  ccStaff: (InOutRegisterCcStaff & { staff: Staff })[];
  parentInward?: {
    id: string;
    serialNo?: string | null;
    documentRefNo?: string | null;
    details?: string | null;
    documentDate?: Date;
  } | null;
  replies?: {
    id: string;
    serialNo?: string | null;
    documentRefNo?: string | null;
    receivedDate?: Date;
    details?: string | null;
  }[];
};

export type InOutRegisterWithComputed = InOutRegisterListRow & {
  isPendingReply: boolean;
  isReplied?: boolean;
  isOverdue?: boolean;
  daysUntilDue?: number | null;
  daysOverdue?: number | null;
  ageInDays: number;
  ccStaffNames: string;
};

