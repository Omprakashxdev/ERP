import { Decimal } from "@prisma/client/runtime/library";
import {
  Project,
  ProjectStatus,
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
  /** Basis for remainingFee calculation. "LEGACY_FEE_RECEIVED" means the value
   *  derives from FundFlow.feeReceived, which may be stale or unverified. */
  remainingFeeBasis: string;
  /** True when reconciliation-derived invoice/settlement/cheque data is present. */
  reconciliationAvailable?: boolean;
  /** Authoritative contract fee from Project.totalFee. */
  totalContractFee?: Decimal;
  /** Sum of DueBill.billAmount (active bills). Null when unavailable. */
  totalInvoiced?: Decimal | null;
  /** Sum of DueBill.receivedAmount (cheque + sd + tds). Null when unavailable. */
  totalSettlement?: Decimal | null;
  /** Sum of DueBill.chequeAmount (recorded cheques, not verified cash). Null when unavailable. */
  totalRecordedCheque?: Decimal | null;
  /** Invoice total minus settlement total. Null when unavailable. */
  outstandingPerSettlement?: Decimal | null;
  /** Raw legacy FundFlow.feeReceived value. Null when no FundFlow record. */
  legacyFeeReceived?: Decimal | null;
  /** Explicit limitation note for recorded cheque totals. */
  recordedCashLabel?: string;
};

export { ProjectStatus };
