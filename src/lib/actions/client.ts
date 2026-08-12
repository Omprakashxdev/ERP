"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Role } from "@/types/auth";
import {
  clientCreateSchema,
  clientUpdateSchema,
  clientFilterSchema,
  ClientCreateInput,
  ClientUpdateInput,
  ClientFilterInput,
} from "@/lib/schemas/client";
import { withAuth, checkRateLimit, audit, sanitizeForAudit, ActionResult } from "./wrapper";

const mutationRoles = [Role.ADMIN, Role.MANAGER];

export async function createClient(
  input: ClientCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    const parsed = clientCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const client = await prisma.client.create({
      data: {
        name: parsed.name,
        abbreviation: parsed.abbreviation,
        address: parsed.address,
        gstNumber: parsed.gstNumber,
        panNumber: parsed.panNumber,
        phone: parsed.phone,
        website: parsed.website,
        contacts: parsed.contacts
          ? {
              create: parsed.contacts
                .filter((c) => !c.id)
                .map((c) => ({
                  name: c.name,
                  email: c.email,
                  phone: c.phone,
                })),
            }
          : undefined,
      },
      select: { id: true },
    });

    await audit(user.id, "create", "Client", client.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/fund-flow");
    revalidatePath("/dashboard/clients");
    return client;
  }, mutationRoles);
}

export async function updateClient(
  input: ClientUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    const parsed = clientUpdateSchema.parse(input);
    const { id, contacts, ...data } = parsed;
    await checkRateLimit(user.id);

    const client = await prisma.$transaction(async (tx) => {
      const updated = await tx.client.update({
        where: { id },
        data,
      });

      if (contacts) {
        const toCreate = contacts.filter((c) => !c.id);
        const toUpdate = contacts.filter((c) => c.id);

        if (toCreate.length > 0) {
          await tx.clientContact.createMany({
            data: toCreate.map((c) => ({
              clientId: id,
              name: c.name,
              email: c.email,
              phone: c.phone,
            })),
          });
        }

        for (const contact of toUpdate) {
          if (!contact.id) continue;
          await tx.clientContact.update({
            where: { id: contact.id },
            data: {
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
            },
          });
        }
      }

      return updated;
    });

    await audit(user.id, "update", "Client", client.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/fund-flow");
    revalidatePath("/dashboard/clients");
    return { id: client.id };
  }, mutationRoles);
}

export async function getClients(
  filter?: ClientFilterInput
): Promise<ActionResult<unknown[]>> {
  return withAuth(async () => {
    const parsed = filter ? clientFilterSchema.parse(filter) : undefined;
    const where = parsed?.search
      ? { name: { contains: parsed.search, mode: "insensitive" as const } }
      : {};

    const clients = await prisma.client.findMany({
      where,
      include: { contacts: true },
      orderBy: { name: "asc" },
    });

    return clients;
  });
}

export async function getClientById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withAuth(async () => {
    const client = await prisma.client.findUnique({
      where: { id },
      include: { contacts: true },
    });
    return client;
  });
}
