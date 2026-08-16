import { Vehicle, JourneyLog, JourneyLogPhoto } from "@prisma/client";

export type VehicleListRow = Vehicle & {
  journeyLogCount: number;
};

export type VehicleWithComputed = VehicleListRow & {
  isAnyDocumentExpired: boolean;
};

export type JourneyLogListRow = JourneyLog & {
  vehicle: Vehicle;
  photos: JourneyLogPhoto[];
  approvedBy?: { id: string; name: string; designation?: string | null } | null;
};

export type JourneyLogWithComputed = JourneyLogListRow & {
  totalExpenses: number;
};
