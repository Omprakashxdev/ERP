"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  progressWingCreateSchema,
  progressWingUpdateSchema,
  progressFloorCreateSchema,
  progressFloorUpdateSchema,
  progressFlatCreateSchema,
  progressFlatUpdateSchema,
  progressRoomCreateSchema,
  progressRoomUpdateSchema,
  ProgressWingCreateInput,
  ProgressWingUpdateInput,
  ProgressFloorCreateInput,
  ProgressFloorUpdateInput,
  ProgressFlatCreateInput,
  ProgressFlatUpdateInput,
  ProgressRoomCreateInput,
  ProgressRoomUpdateInput,
} from "@/lib/schemas/progress-hierarchy";
import { cuid } from "@/lib/schemas/shared";
import {
  withPermission,
  checkRateLimit,
  audit,
  sanitizeForAudit,
  ActionResult,
} from "./wrapper";

const RESOURCE = "progressApp";
const BASE = "/dashboard/progress-app";

/* ─────────────────────────────── Wings ─────────────────────────────── */

export async function createProgressWing(
  input: ProgressWingCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "create", async (user) => {
    const parsed = progressWingCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const site = await prisma.progressSite.findUnique({
      where: { id: parsed.siteId },
      select: { id: true },
    });
    if (!site) throw new Error("Site not found.");

    const duplicate = await prisma.progressWing.findFirst({
      where: { siteId: parsed.siteId, code: parsed.code },
      select: { id: true },
    });
    if (duplicate) {
      throw new Error(
        `Wing code ${parsed.code} already exists in this site.`
      );
    }

    const wing = await prisma.progressWing.create({
      data: parsed,
      select: { id: true },
    });

    await audit(user.id, "create", "ProgressWing", wing.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });
    revalidatePath(`${BASE}/sites/${parsed.siteId}`);
    return wing;
  });
}

export async function updateProgressWing(
  input: ProgressWingUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsed = progressWingUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    const existing = await prisma.progressWing.findUnique({
      where: { id },
      select: { id: true, siteId: true },
    });
    if (!existing) throw new Error("Wing not found.");

    const wing = await prisma.progressWing.update({
      where: { id },
      data,
      select: { id: true },
    });

    await audit(user.id, "update", "ProgressWing", wing.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });
    revalidatePath(`${BASE}/sites/${existing.siteId}`);
    revalidatePath(`${BASE}/wings/${id}`);
    return wing;
  });
}

export async function setProgressWingActive(
  id: string,
  isActive: boolean
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsedId = cuid.parse(id);
    const parsedActive = z_isActive(isActive);
    await checkRateLimit(user.id);

    const existing = await prisma.progressWing.findUnique({
      where: { id: parsedId },
      select: { id: true, siteId: true, isActive: true, code: true },
    });
    if (!existing) throw new Error("Wing not found.");
    if (existing.isActive === parsedActive) return { id: parsedId };

    await prisma.progressWing.update({
      where: { id: parsedId },
      data: { isActive: parsedActive },
    });

    await audit(
      user.id,
      parsedActive ? "activate" : "deactivate",
      "ProgressWing",
      parsedId,
      { code: existing.code }
    );
    revalidatePath(`${BASE}/sites/${existing.siteId}`);
    revalidatePath(`${BASE}/wings/${parsedId}`);
    return { id: parsedId };
  });
}

export async function getProgressWings(
  siteId: string
): Promise<ActionResult<unknown[]>> {
  return withPermission(RESOURCE, "read", async () => {
    const wings = await prisma.progressWing.findMany({
      where: { siteId },
      include: { _count: { select: { floors: true } } },
      orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
    });
    return wings;
  });
}

export async function getProgressWingById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withPermission(RESOURCE, "read", async () => {
    return prisma.progressWing.findUnique({
      where: { id },
      include: {
        site: { select: { id: true, siteCode: true, siteName: true } },
        _count: { select: { floors: true } },
      },
    });
  });
}

/* ─────────────────────────────── Floors ─────────────────────────────── */

export async function createProgressFloor(
  input: ProgressFloorCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "create", async (user) => {
    const parsed = progressFloorCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const wing = await prisma.progressWing.findUnique({
      where: { id: parsed.wingId },
      select: { id: true, siteId: true },
    });
    if (!wing) throw new Error("Wing not found.");

    const duplicate = await prisma.progressFloor.findFirst({
      where: { wingId: parsed.wingId, floorIdentifier: parsed.floorIdentifier },
      select: { id: true },
    });
    if (duplicate) {
      throw new Error(
        `Floor ${parsed.floorIdentifier} already exists in this wing.`
      );
    }

    const floor = await prisma.progressFloor.create({
      data: parsed,
      select: { id: true },
    });

    await audit(user.id, "create", "ProgressFloor", floor.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });
    revalidatePath(`${BASE}/wings/${parsed.wingId}`);
    revalidatePath(`${BASE}/sites/${wing.siteId}`);
    return floor;
  });
}

export async function updateProgressFloor(
  input: ProgressFloorUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsed = progressFloorUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    const existing = await prisma.progressFloor.findUnique({
      where: { id },
      select: { id: true, wingId: true },
    });
    if (!existing) throw new Error("Floor not found.");

    const floor = await prisma.progressFloor.update({
      where: { id },
      data,
      select: { id: true },
    });

    await audit(user.id, "update", "ProgressFloor", floor.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });
    revalidatePath(`${BASE}/wings/${existing.wingId}`);
    revalidatePath(`${BASE}/floors/${id}`);
    return floor;
  });
}

export async function setProgressFloorActive(
  id: string,
  isActive: boolean
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsedId = cuid.parse(id);
    const parsedActive = z_isActive(isActive);
    await checkRateLimit(user.id);

    const existing = await prisma.progressFloor.findUnique({
      where: { id: parsedId },
      select: { id: true, wingId: true, isActive: true, floorIdentifier: true },
    });
    if (!existing) throw new Error("Floor not found.");
    if (existing.isActive === parsedActive) return { id: parsedId };

    await prisma.progressFloor.update({
      where: { id: parsedId },
      data: { isActive: parsedActive },
    });

    await audit(
      user.id,
      parsedActive ? "activate" : "deactivate",
      "ProgressFloor",
      parsedId,
      { floorIdentifier: existing.floorIdentifier }
    );
    revalidatePath(`${BASE}/wings/${existing.wingId}`);
    revalidatePath(`${BASE}/floors/${parsedId}`);
    return { id: parsedId };
  });
}

export async function getProgressFloors(
  wingId: string
): Promise<ActionResult<unknown[]>> {
  return withPermission(RESOURCE, "read", async () => {
    const floors = await prisma.progressFloor.findMany({
      where: { wingId },
      include: { _count: { select: { flats: true } } },
      orderBy: [{ displayOrder: "asc" }, { floorIdentifier: "asc" }],
    });
    return floors;
  });
}

export async function getProgressFloorById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withPermission(RESOURCE, "read", async () => {
    return prisma.progressFloor.findUnique({
      where: { id },
      include: {
        wing: {
          select: {
            id: true,
            code: true,
            name: true,
            site: { select: { id: true, siteCode: true, siteName: true } },
          },
        },
        _count: { select: { flats: true } },
      },
    });
  });
}

/* ─────────────────────────────── Flats ─────────────────────────────── */

export async function createProgressFlat(
  input: ProgressFlatCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "create", async (user) => {
    const parsed = progressFlatCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const floor = await prisma.progressFloor.findUnique({
      where: { id: parsed.floorId },
      select: { id: true, wingId: true },
    });
    if (!floor) throw new Error("Floor not found.");

    const duplicate = await prisma.progressFlat.findFirst({
      where: { floorId: parsed.floorId, flatNumber: parsed.flatNumber },
      select: { id: true },
    });
    if (duplicate) {
      throw new Error(
        `Flat ${parsed.flatNumber} already exists on this floor.`
      );
    }

    const flat = await prisma.progressFlat.create({
      data: parsed,
      select: { id: true },
    });

    await audit(user.id, "create", "ProgressFlat", flat.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });
    revalidatePath(`${BASE}/floors/${parsed.floorId}`);
    revalidatePath(`${BASE}/wings/${floor.wingId}`);
    return flat;
  });
}

export async function updateProgressFlat(
  input: ProgressFlatUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsed = progressFlatUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    const existing = await prisma.progressFlat.findUnique({
      where: { id },
      select: { id: true, floorId: true },
    });
    if (!existing) throw new Error("Flat not found.");

    const flat = await prisma.progressFlat.update({
      where: { id },
      data,
      select: { id: true },
    });

    await audit(user.id, "update", "ProgressFlat", flat.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });
    revalidatePath(`${BASE}/floors/${existing.floorId}`);
    revalidatePath(`${BASE}/flats/${id}`);
    return flat;
  });
}

export async function setProgressFlatActive(
  id: string,
  isActive: boolean
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsedId = cuid.parse(id);
    const parsedActive = z_isActive(isActive);
    await checkRateLimit(user.id);

    const existing = await prisma.progressFlat.findUnique({
      where: { id: parsedId },
      select: { id: true, floorId: true, isActive: true, flatNumber: true },
    });
    if (!existing) throw new Error("Flat not found.");
    if (existing.isActive === parsedActive) return { id: parsedId };

    await prisma.progressFlat.update({
      where: { id: parsedId },
      data: { isActive: parsedActive },
    });

    await audit(
      user.id,
      parsedActive ? "activate" : "deactivate",
      "ProgressFlat",
      parsedId,
      { flatNumber: existing.flatNumber }
    );
    revalidatePath(`${BASE}/floors/${existing.floorId}`);
    revalidatePath(`${BASE}/flats/${parsedId}`);
    return { id: parsedId };
  });
}

export async function getProgressFlats(
  floorId: string
): Promise<ActionResult<unknown[]>> {
  return withPermission(RESOURCE, "read", async () => {
    const flats = await prisma.progressFlat.findMany({
      where: { floorId },
      include: { _count: { select: { rooms: true } } },
      orderBy: [{ displayOrder: "asc" }, { flatNumber: "asc" }],
    });
    return flats;
  });
}

export async function getProgressFlatById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withPermission(RESOURCE, "read", async () => {
    return prisma.progressFlat.findUnique({
      where: { id },
      include: {
        floor: {
          select: {
            id: true,
            floorIdentifier: true,
            displayName: true,
            wing: {
              select: {
                id: true,
                code: true,
                name: true,
                site: {
                  select: { id: true, siteCode: true, siteName: true },
                },
              },
            },
          },
        },
        _count: { select: { rooms: true } },
      },
    });
  });
}

/* ─────────────────────────────── Rooms ─────────────────────────────── */

export async function createProgressRoom(
  input: ProgressRoomCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "create", async (user) => {
    const parsed = progressRoomCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const flat = await prisma.progressFlat.findUnique({
      where: { id: parsed.flatId },
      select: { id: true, floorId: true },
    });
    if (!flat) throw new Error("Flat not found.");

    const duplicate = await prisma.progressRoom.findFirst({
      where: {
        flatId: parsed.flatId,
        roomName: { equals: parsed.roomName, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new Error(
        `Room "${parsed.roomName}" already exists in this flat.`
      );
    }

    const room = await prisma.progressRoom.create({
      data: parsed,
      select: { id: true },
    });

    await audit(user.id, "create", "ProgressRoom", room.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });
    revalidatePath(`${BASE}/flats/${parsed.flatId}`);
    revalidatePath(`${BASE}/floors/${flat.floorId}`);
    return room;
  });
}

export async function updateProgressRoom(
  input: ProgressRoomUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsed = progressRoomUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    const existing = await prisma.progressRoom.findUnique({
      where: { id },
      select: { id: true, flatId: true },
    });
    if (!existing) throw new Error("Room not found.");

    const room = await prisma.progressRoom.update({
      where: { id },
      data,
      select: { id: true },
    });

    await audit(user.id, "update", "ProgressRoom", room.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });
    revalidatePath(`${BASE}/flats/${existing.flatId}`);
    revalidatePath(`${BASE}/rooms/${id}`);
    return room;
  });
}

export async function setProgressRoomActive(
  id: string,
  isActive: boolean
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsedId = cuid.parse(id);
    const parsedActive = z_isActive(isActive);
    await checkRateLimit(user.id);

    const existing = await prisma.progressRoom.findUnique({
      where: { id: parsedId },
      select: { id: true, flatId: true, isActive: true, roomName: true },
    });
    if (!existing) throw new Error("Room not found.");
    if (existing.isActive === parsedActive) return { id: parsedId };

    await prisma.progressRoom.update({
      where: { id: parsedId },
      data: { isActive: parsedActive },
    });

    await audit(
      user.id,
      parsedActive ? "activate" : "deactivate",
      "ProgressRoom",
      parsedId,
      { roomName: existing.roomName }
    );
    revalidatePath(`${BASE}/flats/${existing.flatId}`);
    revalidatePath(`${BASE}/rooms/${parsedId}`);
    return { id: parsedId };
  });
}

export async function getProgressRooms(
  flatId: string
): Promise<ActionResult<unknown[]>> {
  return withPermission(RESOURCE, "read", async () => {
    const rooms = await prisma.progressRoom.findMany({
      where: { flatId },
      orderBy: [{ displayOrder: "asc" }, { roomName: "asc" }],
    });
    return rooms;
  });
}

/* ────────────────────────────── helpers ────────────────────────────── */

function z_isActive(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error("isActive must be a boolean.");
  }
  return value;
}
