import { InOutRegister, Client, Staff, InOutRegisterDocument, InOutRegisterCcStaff } from "@prisma/client";

export type InOutRegisterListRow = InOutRegister & {
  client: Client;
  actionSuggestedStaff: Staff | null;
  documents: InOutRegisterDocument[];
  ccStaff: (InOutRegisterCcStaff & { staff: Staff })[];
};

export type InOutRegisterWithComputed = InOutRegisterListRow & {
  isPendingReply: boolean;
  ageInDays: number;
  ccStaffNames: string;
};
