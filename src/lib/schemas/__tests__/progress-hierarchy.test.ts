import { describe, it, expect } from "vitest";
import {
  progressWingCreateSchema,
  progressWingUpdateSchema,
  progressFloorCreateSchema,
  progressFloorUpdateSchema,
  progressFlatCreateSchema,
  progressFlatUpdateSchema,
  progressRoomCreateSchema,
  progressRoomUpdateSchema,
} from "@/lib/schemas/progress-hierarchy";

const validId = "clxxxxxxxxxxxxxxxxxxxxxxxxx";
const siteId = "clsitexxxxxxxxxxxxxxxxxxxx";
const wingId = "clwingxxxxxxxxxxxxxxxxxxx";
const floorId = "clfloorxxxxxxxxxxxxxxxxxx";
const flatId = "clflatxxxxxxxxxxxxxxxxxxx";

describe("Progress App — wing schema", () => {
  it("accepts a valid payload and uppercases the code", () => {
    const result = progressWingCreateSchema.safeParse({
      siteId,
      code: " a-1 ",
      name: "Tower A",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("A-1");
      expect(result.data.displayOrder).toBe(0);
    }
  });

  it("rejects invalid wing codes", () => {
    for (const code of ["", "A@1", "_BAD", "-BAD", "CODE!"]) {
      const result = progressWingCreateSchema.safeParse({
        siteId,
        code,
        name: "Wing",
      });
      expect(result.success).toBe(false);
    }
  });

  it("accepts codes with spaces, dots and slashes", () => {
    for (const code of ["TOWER B", "BLK.1", "W/A", "A-1"]) {
      const result = progressWingCreateSchema.safeParse({
        siteId,
        code,
        name: "Wing",
      });
      expect(result.success).toBe(true);
    }
  });

  it("update schema strips code and siteId (immutable)", () => {
    const result = progressWingUpdateSchema.safeParse({
      id: validId,
      siteId,
      code: "B-2",
      name: "Renamed Wing",
      isActive: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Renamed Wing");
      expect("code" in result.data).toBe(false);
      expect("siteId" in result.data).toBe(false);
      expect("isActive" in result.data).toBe(false);
    }
  });
});

describe("Progress App — floor schema", () => {
  it("accepts alphanumeric identifiers like G, B1, 10", () => {
    for (const id2 of ["G", "B1", "1", "10", "TERRACE"]) {
      const result = progressFloorCreateSchema.safeParse({
        wingId,
        floorIdentifier: id2,
      });
      expect(result.success).toBe(true);
    }
  });

  it("uppercases and trims the floor identifier", () => {
    const result = progressFloorCreateSchema.safeParse({
      wingId,
      floorIdentifier: " g ",
      displayName: "Ground Floor",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.floorIdentifier).toBe("G");
    }
  });

  it("rejects empty identifier", () => {
    const result = progressFloorCreateSchema.safeParse({
      wingId,
      floorIdentifier: " ",
    });
    expect(result.success).toBe(false);
  });

  it("update schema strips identifier and wingId", () => {
    const result = progressFloorUpdateSchema.safeParse({
      id: validId,
      wingId,
      floorIdentifier: "5",
      displayName: "Fifth",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("floorIdentifier" in result.data).toBe(false);
      expect("wingId" in result.data).toBe(false);
    }
  });
});

describe("Progress App — flat schema", () => {
  it("accepts a valid flat", () => {
    const result = progressFlatCreateSchema.safeParse({
      floorId,
      flatNumber: "101",
      flatType: "2BHK",
      displayOrder: 3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.flatNumber).toBe("101");
      expect(result.data.displayOrder).toBe(3);
    }
  });

  it("rejects empty flat number and negative display order", () => {
    expect(
      progressFlatCreateSchema.safeParse({ floorId, flatNumber: "" }).success
    ).toBe(false);
    expect(
      progressFlatCreateSchema.safeParse({
        floorId,
        flatNumber: "101",
        displayOrder: -1,
      }).success
    ).toBe(false);
  });

  it("update schema strips flatNumber and floorId", () => {
    const result = progressFlatUpdateSchema.safeParse({
      id: validId,
      floorId,
      flatNumber: "999",
      flatType: "3BHK",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.flatType).toBe("3BHK");
      expect("flatNumber" in result.data).toBe(false);
      expect("floorId" in result.data).toBe(false);
    }
  });
});

describe("Progress App — room schema", () => {
  it("accepts a free-form room type (not enum-restricted)", () => {
    for (const roomType of ["Bedroom", "Store", "Pooja Room", "Utility"]) {
      const result = progressRoomCreateSchema.safeParse({
        flatId,
        roomName: "Room 1",
        roomType,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts a missing room type", () => {
    const result = progressRoomCreateSchema.safeParse({
      flatId,
      roomName: "Balcony",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty room name", () => {
    expect(
      progressRoomCreateSchema.safeParse({ flatId, roomName: "" }).success
    ).toBe(false);
  });

  it("update schema strips roomName and flatId", () => {
    const result = progressRoomUpdateSchema.safeParse({
      id: validId,
      flatId,
      roomName: "Renamed",
      roomType: "Study",
      isActive: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.roomType).toBe("Study");
      expect("roomName" in result.data).toBe(false);
      expect("flatId" in result.data).toBe(false);
    }
  });
});
