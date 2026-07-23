import { Decimal } from "@prisma/client/runtime/library";
import { Tender, TenderStatus, WorkType, ServiceType } from "@prisma/client";

export type TenderListRow = Tender;

export type TenderWithComputed = TenderListRow & {
  totalTenderFees: Decimal;
  totalEmd: Decimal;
  lowestQuotedAmount: Decimal | null;
};

export { TenderStatus, WorkType, ServiceType };
