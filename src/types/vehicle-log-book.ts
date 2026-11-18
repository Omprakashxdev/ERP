import { Vehicle, JourneyLog, JourneyLogPhoto, JourneyStop } from "@prisma/client";

export type VehicleListRow = Vehicle & {
  journeyLogCount: number;
};

export type VehicleWithComputed = VehicleListRow & {
  isAnyDocumentExpired: boolean;
};

export type JourneyLogListRow = JourneyLog & {
  vehicle: Vehicle;
  photos: JourneyLogPhoto[];
  stops?: JourneyStop[];
  approvedBy?: { id: string; name: string; designation?: string | null } | null;
};

export type JourneyLogWithComputed = JourneyLogListRow & {
  totalExpenses: number;
};
