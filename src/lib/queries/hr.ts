import { EmployeeFilterInput } from "@/lib/schemas/hr";
import { Prisma } from "@prisma/client";

export function buildEmployeeWhere(filter?: EmployeeFilterInput): Prisma.StaffWhereInput {
  const where: Prisma.StaffWhereInput = {};
  const and: Prisma.StaffWhereInput[] = [];

  if (filter?.search?.trim()) {
    const term = filter.search.trim();
    and.push({
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
        { employeeCode: { contains: term, mode: "insensitive" } },
        { designation: { contains: term, mode: "insensitive" } },
      ],
    });
  }

  if (filter?.department) {
    and.push({ employeeDetail: { department: { equals: filter.department } } });
  }
  if (filter?.presentCity) {
    and.push({ employeeDetail: { presentCity: { equals: filter.presentCity } } });
  }
  if (filter?.isActive === "true") and.push({ isActive: true });
  if (filter?.isActive === "false") and.push({ isActive: false });

  if (and.length > 0) where.AND = and;
  return where;
}
