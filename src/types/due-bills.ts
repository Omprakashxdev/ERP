import { Decimal } from "@prisma/client/runtime/library";
import {
  DueBill,
  DueBillStatus,
  Project,
  Client,
  Region,
} from "@prisma/client";

export type DueBillListRow = DueBill & {
  project: Project & {
    client: Client;
    region: Region;
  };
};

export type DueBillWithComputed = DueBillListRow & {
  pendingAmount: Decimal;
  computedStatus: DueBillStatus;
};

export { DueBillStatus };
