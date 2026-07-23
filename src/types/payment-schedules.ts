import { PaymentSchedule } from "@prisma/client";

export type PaymentScheduleListRow = PaymentSchedule;
export type PaymentScheduleWithComputed = PaymentScheduleListRow & {
  isOverdue: boolean;
};
