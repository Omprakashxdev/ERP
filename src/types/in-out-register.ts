import { InOutRegister, Client, Staff, InOutRegisterDocument, InOutRegisterCcStaff } from "@prisma/client";

export type InOutRegisterListRow = InOutRegister & {
  client: Client;
  actionSuggestedStaff: Staff | null;
  documents: InOutRegisterDocument[];
  ccStaff: (InOutRegisterCcStaff & { staff: Staff })[];
  parentInward?: {
    id: string;
    documentRefNo: string;
    details?: string | null;
    documentDate?: Date;
  } | null;
  replies?: {
    id: string;
    documentRefNo: string;
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

