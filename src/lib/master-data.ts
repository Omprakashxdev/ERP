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
  typeMasters?: { id: string; name: string }[];
  dprMasters: { id: string; referenceNumber: string }[];
  tsAaMasters: { id: string; referenceNumber: string }[];
  drawingMasters?: { id: string; name: string; referenceNumber?: string | null }[];
  workOrderMasters?: { id: string; name: string; referenceNumber?: string | null }[];
  contactMasters?: { id: string; name: string; phone?: string | null; email?: string | null; address?: string | null }[];
  staffList?: { id: string; name: string }[];
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
    typeMasters,
    dprMasters,
    tsAaMasters,
    drawingMasters,
    workOrderMasters,
    contactMasters,
    staffList,
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
    (prisma as any).typeMaster
      ? (prisma as any).typeMaster.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    prisma.dprMaster.findMany({ orderBy: { referenceNumber: "asc" }, select: { id: true, referenceNumber: true } }),
    prisma.tsAaMaster.findMany({ orderBy: { referenceNumber: "asc" }, select: { id: true, referenceNumber: true } }),
    (prisma as any).drawingMaster
      ? (prisma as any).drawingMaster.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, referenceNumber: true } })
      : Promise.resolve([]),
    (prisma as any).workOrderMaster
      ? (prisma as any).workOrderMaster.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, referenceNumber: true } })
      : Promise.resolve([]),
    (prisma as any).contactMaster
      ? (prisma as any).contactMaster.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, email: true, address: true } })
      : Promise.resolve([]),
    prisma.staff.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
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
    typeMasters,
    dprMasters,
    tsAaMasters,
    drawingMasters,
    workOrderMasters,
    contactMasters,
    staffList,
  };
}
