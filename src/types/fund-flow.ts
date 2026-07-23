import { Decimal } from "@prisma/client/runtime/library";
import {
  Project,
  ProjectStatus,
  ServiceType,
  WorkType,
  FundFlow,
  Client,
  Region,
  Contractor,
  ProjectFeeStage,
} from "@prisma/client";

export type FundFlowListRow = Project & {
  region: Region;
  client: Client;
  contractor: Contractor | null;
  fundFlow: FundFlow | null;
  assignments: {
    role: string;
    staff: { id: string; name: string | null };
    allocation: Decimal | null;
  }[];
  feeStages: ProjectFeeStage[];
};

export type FundFlowWithComputed = FundFlowListRow & {
  remainingWorkAmt: Decimal;
  remainingFee: Decimal;
};

export { ProjectStatus, ServiceType, WorkType };
