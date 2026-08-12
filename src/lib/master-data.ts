import { prisma } from "@/lib/prisma";

export interface MasterData {
  departments: { id: string; name: string }[];
  designations: { id: string; name: string }[];
  states: { id: string; name: string }[];
  cities: { id: string; name: string; stateId?: string | null }[];
  platforms: { id: string; name: string; url?: string | null }[];
  paymentTypes: { id: string; name: string }[];
  assetCategories: { id: string; name: string }[];
  assetMakes: { id: string; name: string }[];
  assetModels: { id: string; name: string; makeId?: string | null }[];
  orderMasters: { id: string; name: string }[];
  workMasters: { id: string; name: string }[];
  dprMasters: { id: string; referenceNumber: string }[];
  tsAaMasters: { id: string; referenceNumber: string }[];
}

export async function fetchAllMasters(): Promise<MasterData> {
  const [
    departments,
    designations,
    states,
    cities,
    platforms,
    paymentTypes,
    assetCategories,
    assetMakes,
    assetModels,
    orderMasters,
    workMasters,
    dprMasters,
    tsAaMasters,
  ] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.designation.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.state.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.city.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, stateId: true } }),
    prisma.platform.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, url: true } }),
    prisma.paymentType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.assetCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.assetMake.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.assetModel.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, makeId: true } }),
    prisma.orderMaster.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.workMaster.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.dprMaster.findMany({ orderBy: { referenceNumber: "asc" }, select: { id: true, referenceNumber: true } }),
    prisma.tsAaMaster.findMany({ orderBy: { referenceNumber: "asc" }, select: { id: true, referenceNumber: true } }),
  ]);

  return {
    departments,
    designations,
    states,
    cities,
    platforms,
    paymentTypes,
    assetCategories,
    assetMakes,
    assetModels,
    orderMasters,
    workMasters,
    dprMasters,
    tsAaMasters,
  };
}
