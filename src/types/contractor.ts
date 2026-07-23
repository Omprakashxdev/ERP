import { Contractor } from "@prisma/client";

export type ContractorListRow = Contractor & {
  _count: { projects: number };
};

export type ContractorWithComputed = ContractorListRow & {
  projectCount: number;
};
