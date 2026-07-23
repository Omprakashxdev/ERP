import { Decimal } from "@prisma/client/runtime/library";
import {
  WorkInProgress,
  WipStatus,
  Project,
  Client,
  Region,
} from "@prisma/client";

export type WipListRow = WorkInProgress & {
  project: Project & {
    client: Client;
    region: Region;
  };
  assignments: {
    level: string;
    staff: { id: string; name: string | null };
  }[];
  hoCoordinator: { id: string; name: string | null } | null;
  roCoordinator: { id: string; name: string | null } | null;
};

export type WipWithComputed = WipListRow & {
  totalRaAmount: Decimal;
  totalSaecFee: Decimal;
  totalProjectExpense: Decimal;
  balanceWorkAmount: Decimal;
};

export { WipStatus };
