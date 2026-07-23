import { ContractorFilterInput } from "@/lib/schemas/contractor";

export function buildContractorWhere(
  filter?: ContractorFilterInput
): Record<string, unknown> {
  if (!filter?.search?.trim()) {
    return {};
  }

  const term = filter.search.trim();

  return {
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { contactPerson: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
      { phone: { contains: term, mode: "insensitive" } },
      { address: { contains: term, mode: "insensitive" } },
      { workName: { contains: term, mode: "insensitive" } },
      { tenderId: { contains: term, mode: "insensitive" } },
    ],
  };
}
