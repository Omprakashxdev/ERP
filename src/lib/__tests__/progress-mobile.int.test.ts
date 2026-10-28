/**
 * Brick 4 — mobile backend integration tests on a disposable DB.
 * Requires: RUN_INTEGRATION_TESTS=1 + DATABASE_URL=...disposable
 *
 * Covers: DB-level one-active-checklist invariant, concurrent assignment
 * races, ancestor-inactive transition rejection, eventId content binding,
 * site-staff assignments + history, mobile login/refresh/logout flows,
 * read APIs scoped by assignment, PATCH status (409 stale, idempotent
 * replay, canUpdate enforcement, disabled users), and photo uploads at
 * every target level incl. malicious-content rejection.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

process.env.MOBILE_TOKEN_SECRET ??=
  "integration-test-mobile-secret-0123456789abcdef";

const currentRole = "ADMIN";
const currentUserId = "int-test-user";

vi.mock("../actions/wrapper", () => ({
  withPermission: async (
    _r: string,
    action: string,
    fn: (u: { id: string }) => unknown
  ) => {
    if (action !== "read" && currentRole !== "ADMIN") {
      return {
        success: false,
        error: "You do not have permission to perform this action.",
      };
    }
    try {
      return { success: true, data: await fn({ id: currentUserId }) };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
  checkRateLimit: async () => {},
  audit: async () => {},
  sanitizeForAudit: async (v: unknown) => v,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// Route handlers must never run inside a "use server" directive — the ERP
// auth module is mocked out for the one route that references it.
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

import { prisma } from "@/lib/prisma";
import { assignRoomChecklist } from "../actions/progress-activity";
import {
  assignSiteStaff,
  setSiteAssignmentActive,
  updateSiteAssignmentScope,
  getSiteAssignmentHistory,
} from "../actions/progress-assignments";
import { transitionRoomActivityStatus } from "../actions/progress-activity";
import { deletePhotoFile } from "@/lib/progress-photos";

import { POST as loginPost } from "@/app/api/mobile/v1/auth/login/route";
import { POST as refreshPost } from "@/app/api/mobile/v1/auth/refresh/route";
import { POST as logoutPost } from "@/app/api/mobile/v1/auth/logout/route";
import { GET as meGet } from "@/app/api/mobile/v1/me/route";
import { GET as sitesGet } from "@/app/api/mobile/v1/sites/route";
import { GET as siteGet } from "@/app/api/mobile/v1/sites/[siteId]/route";
import { GET as wingsGet } from "@/app/api/mobile/v1/sites/[siteId]/wings/route";
import { GET as floorsGet } from "@/app/api/mobile/v1/wings/[wingId]/floors/route";
import { GET as flatsGet } from "@/app/api/mobile/v1/floors/[floorId]/flats/route";
import { GET as roomsGet } from "@/app/api/mobile/v1/flats/[flatId]/rooms/route";
import { GET as activitiesGet } from "@/app/api/mobile/v1/rooms/[roomId]/activities/route";
import { GET as summaryGet } from "@/app/api/mobile/v1/progress/summary/route";
import { PATCH as statusPatch } from "@/app/api/mobile/v1/activities/[activityId]/status/route";
import {
  POST as photoPost,
  GET as photosGet,
} from "@/app/api/mobile/v1/photos/route";
import { GET as photoContentGet } from "@/app/api/mobile/v1/photos/[photoId]/content/route";

const RUN = process.env.RUN_INTEGRATION_TESTS ? describe : describe.skip;

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from([0x00, 0x10]),
  Buffer.from("JFIF\0", "ascii"),
  Buffer.alloc(11, 0),
  Buffer.from([0xff, 0xd9]),
]);
const SVG_BYTES = Buffer.from(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
);
const EXE_BYTES = Buffer.from("MZ" + "\0".repeat(100), "binary");

let reqIp = 0;

function req(
  path: string,
  init?: { method?: string; token?: string; body?: unknown; ip?: string }
): NextRequest {
  const headers: Record<string, string> = {};
  // Each synthetic request gets a distinct client IP, like distinct real
  // clients hitting the per-IP login limiter — the routes' own logic is
  // what these tests exercise; the limiter is covered separately.
  headers["x-forwarded-for"] = init?.ip ?? `10.99.${reqIp >> 8}.${reqIp++ & 255}`;
  if (init?.token) headers.authorization = `Bearer ${init.token}`;
  if (init?.body !== undefined && !(init.body instanceof FormData)) {
    headers["content-type"] = "application/json";
  }
  return new NextRequest(`http://localhost${path}`, {
    method: init?.method ?? "GET",
    headers,
    body:
      init?.body === undefined
        ? undefined
        : init.body instanceof FormData
          ? init.body
          : JSON.stringify(init.body),
  });
}

const p = (v: Record<string, string>) =>
  ({ params: Promise.resolve(v) }) as never;

async function json(res: Response) {
  return res.json();
}

let adminUser: { id: string };
let fieldUser: { id: string; email: string };
let fieldUser2: { id: string; email: string };
let viewerUser: { id: string; email: string };
let unassignedUser: { id: string; email: string };
let disabledUser: { id: string; email: string };
let site: { id: string };
let site2: { id: string };
let wing: { id: string };
let floor: { id: string };
let flat: { id: string };
let room: { id: string };
let roomB: { id: string };
let template: { id: string };
let activities: { id: string; revision: number }[];

let fieldToken: string;
let fieldRefresh: string;
let fieldToken2: string;
let viewerToken: string;
let unassignedToken: string;
const uploadedStorageKeys: string[] = [];

async function makeUser(
  email: string,
  password: string,
  role: "STAFF" | "ADMIN" = "STAFF"
) {
  const hashedPassword = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    create: { email, name: email.split("@")[0], role, hashedPassword },
    update: { role, hashedPassword, isActive: true },
  });
}

async function login(email: string, password: string) {
  const res = await loginPost(
    req("/api/mobile/v1/auth/login", {
      method: "POST",
      body: { email, password },
    })
  );
  return { status: res.status, body: await json(res) };
}

RUN("Brick 4 — mobile backend", () => {
  beforeAll(async () => {
    // shared fixture user for ERP action calls
    await prisma.user.createMany({
      data: [
        {
          id: "int-test-user",
          email: "int-test-user@saec.test",
          name: "Integration",
          role: "ADMIN",
          hashedPassword: "x",
        },
      ],
      skipDuplicates: true,
    });
    adminUser = (await prisma.user.findUniqueOrThrow({
      where: { id: "int-test-user" },
    }))!;

    fieldUser = await makeUser("field1@mob.test", "FieldPass1!");
    fieldUser2 = await makeUser("field2@mob.test", "FieldPass2!");
    viewerUser = await makeUser("viewer@mob.test", "ViewerPass1!");
    unassignedUser = await makeUser("outsider@mob.test", "OutsidePass1!");
    disabledUser = await makeUser("disabled@mob.test", "DisabledPass1!");

    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    site = await prisma.progressSite.create({
      data: {
        siteCode: `MOB-${suffix}`,
        siteName: "Mobile QA Site",
        status: "ACTIVE",
        createdById: adminUser.id,
      },
    });
    site2 = await prisma.progressSite.create({
      data: {
        siteCode: `MO2-${suffix}`,
        siteName: "Other Site",
        status: "ACTIVE",
        createdById: adminUser.id,
      },
    });
    wing = await prisma.progressWing.create({
      data: { siteId: site.id, code: "W1", name: "Wing 1" },
    });
    floor = await prisma.progressFloor.create({
      data: { wingId: wing.id, floorIdentifier: "1" },
    });
    flat = await prisma.progressFlat.create({
      data: { floorId: floor.id, flatNumber: "101" },
    });
    room = await prisma.progressRoom.create({
      data: { flatId: flat.id, roomName: "Living Room" },
    });
    roomB = await prisma.progressRoom.create({
      data: { flatId: flat.id, roomName: "Bedroom" },
    });
    template = await prisma.progressActivityTemplate.create({
      data: {
        name: `Mobile Tpl ${Date.now() % 100000}`,
        createdById: adminUser.id,
        items: {
          create: [0, 1, 2, 3].map((i) => ({
            activityName: `Activity ${i}`,
            displayOrder: i,
          })),
        },
      },
    });

    // wipe assignments left over from previous runs of this suite
    await prisma.progressSiteAssignment.deleteMany({
      where: {
        userId: {
          in: [
            fieldUser.id,
            fieldUser2.id,
            viewerUser.id,
            unassignedUser.id,
            disabledUser.id,
          ],
        },
      },
    });

    // assignments: fieldUser full, viewer view-only, fieldUser2 update on site2
    for (const [u, cv, cu, s] of [
      [fieldUser, true, true, site],
      [viewerUser, true, false, site],
      [fieldUser2, true, true, site2],
    ] as const) {
      await prisma.progressSiteAssignment.create({
        data: {
          siteId: s.id,
          userId: u.id,
          canView: cv,
          canUpdate: cu,
          assignedById: adminUser.id,
        },
      });
    }

    const cl = await assignRoomChecklist({
      roomId: room.id,
      templateId: template.id,
    });
    expect(cl.success).toBe(true);
    activities = await prisma.progressRoomActivity.findMany({
      where: { roomChecklist: { roomId: room.id, isActive: true } },
      orderBy: { displayOrder: "asc" },
      select: { id: true, revision: true },
    });

    const l1 = await login("field1@mob.test", "FieldPass1!");
    fieldToken = l1.body.accessToken;
    fieldRefresh = l1.body.refreshToken;
    const l2 = await login("field2@mob.test", "FieldPass2!");
    fieldToken2 = l2.body.accessToken;
    const lv = await login("viewer@mob.test", "ViewerPass1!");
    viewerToken = lv.body.accessToken;
    const lu = await login("outsider@mob.test", "OutsidePass1!");
    unassignedToken = lu.body.accessToken;
  }, 60000);

  afterAll(async () => {
    for (const key of uploadedStorageKeys) await deletePhotoFile(key);
    await prisma.progressPhoto.deleteMany({
      where: { uploadedById: { in: [fieldUser.id] } },
    });
  });

  /* ─── Step 1: Brick 3 hardening ─── */

  it("DB enforces one active checklist — concurrent assigns leave exactly one", async () => {
    const other = await prisma.progressActivityTemplate.create({
      data: {
        name: `Race Tpl ${Date.now() % 100000}`,
        createdById: adminUser.id,
        items: { create: [{ activityName: "A1", displayOrder: 0 }] },
      },
    });
    const [r1, r2] = await Promise.all([
      assignRoomChecklist({ roomId: roomB.id, templateId: template.id }),
      assignRoomChecklist({ roomId: roomB.id, templateId: other.id }),
    ]);
    // The partial unique index guarantees the invariant no matter how the
    // two transactions interleave — exactly one active checklist may exist.
    // (Both calls may legitimately succeed: the later replace deactivates
    // the earlier snapshot, which is the intended replace semantics.)
    const active = await prisma.progressRoomChecklist.count({
      where: { roomId: roomB.id, isActive: true },
    });
    expect(active).toBe(1);
  });

  it("rejects transitions on deactivated ancestors", async () => {
    // deactivate the room → transition must fail
    await prisma.progressRoom.update({
      where: { id: room.id },
      data: { isActive: false },
    });
    const res = await transitionRoomActivityStatus({
      roomActivityId: activities[0].id,
      status: "IN_PROGRESS",
      expectedRevision: 0,
      eventId: `evt-inactive-${Date.now()}`,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/deactivated|archived|no longer active/i);
    await prisma.progressRoom.update({
      where: { id: room.id },
      data: { isActive: true },
    });
  });

  it("rejects transitions when the site is archived", async () => {
    await prisma.progressSite.update({
      where: { id: site.id },
      data: { status: "ARCHIVED" },
    });
    const res = await transitionRoomActivityStatus({
      roomActivityId: activities[0].id,
      status: "IN_PROGRESS",
      expectedRevision: 0,
      eventId: `evt-arch-${Date.now()}`,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/archived/i);
    await prisma.progressSite.update({
      where: { id: site.id },
      data: { status: "ACTIVE" },
    });
  });

  it("rejects checklist assignment on a deactivated room", async () => {
    const tmpRoom = await prisma.progressRoom.create({
      data: { flatId: flat.id, roomName: "Dead Room", isActive: false },
    });
    const res = await assignRoomChecklist({
      roomId: tmpRoom.id,
      templateId: template.id,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/deactivated/i);
  });

  it("eventId replay with different contents is rejected", async () => {
    const eventId = `evt-bind-${Date.now()}`;
    const first = await transitionRoomActivityStatus({
      roomActivityId: activities[0].id,
      status: "IN_PROGRESS",
      expectedRevision: 0,
      eventId,
    });
    expect(first.success).toBe(true);

    // same eventId, different activity → conflict
    const other = await transitionRoomActivityStatus({
      roomActivityId: activities[1].id,
      status: "IN_PROGRESS",
      expectedRevision: 0,
      eventId,
    });
    expect(other.success).toBe(false);
    expect(other.error).toMatch(/eventId/i);

    // same eventId + activity, different target status → conflict
    const wrongStatus = await transitionRoomActivityStatus({
      roomActivityId: activities[0].id,
      status: "COMPLETED",
      expectedRevision: 1,
      eventId,
    });
    expect(wrongStatus.success).toBe(false);
    expect(wrongStatus.error).toMatch(/eventId/i);

    // exact replay → idempotent success
    const replay = await transitionRoomActivityStatus({
      roomActivityId: activities[0].id,
      status: "IN_PROGRESS",
      expectedRevision: 0,
      eventId,
    });
    expect(replay.success).toBe(true);
    expect((replay.data as { alreadyApplied: boolean }).alreadyApplied).toBe(
      true
    );
    const histCount = await prisma.progressActivityHistory.count({
      where: { eventId },
    });
    expect(histCount).toBe(1);
  });

  /* ─── Step 2: site-staff assignments ─── */

  it("assignment lifecycle: grant → scope update → revoke → history", async () => {
    const tmpUser = await makeUser("tmp-assign@mob.test", "TmpPass1!");
    const grant = await assignSiteStaff({
      siteId: site2.id,
      userId: tmpUser.id,
      canView: true,
      canUpdate: false,
    });
    expect(grant.success).toBe(true);
    const assignmentId = (grant.data as { id: string }).id;

    const scope = await updateSiteAssignmentScope({
      assignmentId,
      canView: true,
      canUpdate: true,
    });
    expect(scope.success).toBe(true);

    const revoke = await setSiteAssignmentActive(assignmentId, false);
    expect(revoke.success).toBe(true);

    const history = await getSiteAssignmentHistory(site2.id);
    const events = (
      history.data as { assignmentId: string; type: string }[]
    ).filter((e) => e.assignmentId === assignmentId);
    expect(events.map((e) => e.type).sort()).toEqual([
      "GRANTED",
      "REVOKED",
      "SCOPE_UPDATED",
    ]);
  });

  it("canUpdate without canView is rejected by validation", async () => {
    const tmpUser = await makeUser("badscope@mob.test", "TmpPass1!");
    const res = await assignSiteStaff({
      siteId: site2.id,
      userId: tmpUser.id,
      canView: false,
      canUpdate: true,
    });
    expect(res.success).toBe(false);
  });

  /* ─── Step 3: mobile auth ─── */

  it("login issues access + refresh; wrong password rejected; no hash leaked", async () => {
    const good = await login("field1@mob.test", "FieldPass1!");
    expect(good.status).toBe(200);
    expect(good.body.accessToken).toBeTruthy();
    expect(good.body.refreshToken).toBeTruthy();
    const serialized = JSON.stringify(good.body);
    expect(serialized).not.toContain("hashedPassword");
    expect(serialized).not.toContain("$2");

    const bad = await login("field1@mob.test", "WrongPass!");
    expect(bad.status).toBe(401);
  });

  it("disabled user cannot log in", async () => {
    await prisma.user.update({
      where: { id: disabledUser.id },
      data: { isActive: false },
    });
    const res = await login("disabled@mob.test", "DisabledPass1!");
    expect(res.status).toBe(401);
  });

  it("login is rate limited per client IP", async () => {
    const ip = "10.88.1.2";
    const post = () =>
      loginPost(
        req("/api/mobile/v1/auth/login", {
          method: "POST",
          ip,
          body: { email: "nobody@mob.test", password: "Nope123!" },
        })
      );
    for (let i = 0; i < 10; i++) {
      expect((await post()).status).toBe(401);
    }
    const limited = await post();
    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe("RATE_LIMITED");
  });

  it("access token alone reaches /me; bogus token rejected", async () => {
    const me = await meGet(
      req("/api/mobile/v1/me", { token: fieldToken })
    );
    expect(me.status).toBe(200);
    const body = await json(me);
    expect(body.user.email).toBe("field1@mob.test");
    expect(body.assignments.length).toBe(1);

    const bogus = await meGet(
      req("/api/mobile/v1/me", { token: "not.a.token" })
    );
    expect(bogus.status).toBe(401);
  });

  it("refresh rotates; replaying the old token revokes the family", async () => {
    const r1 = await refreshPost(
      req("/api/mobile/v1/auth/refresh", {
        method: "POST",
        body: { refreshToken: fieldRefresh },
      })
    );
    expect(r1.status).toBe(200);
    const b1 = await json(r1);
    expect(b1.refreshToken).not.toBe(fieldRefresh);

    // replay the consumed token → reuse → family revoked
    const replay = await refreshPost(
      req("/api/mobile/v1/auth/refresh", {
        method: "POST",
        body: { refreshToken: fieldRefresh },
      })
    );
    expect(replay.status).toBe(401);

    // the rotated token is now dead too
    const dead = await refreshPost(
      req("/api/mobile/v1/auth/refresh", {
        method: "POST",
        body: { refreshToken: b1.refreshToken },
      })
    );
    expect(dead.status).toBe(401);
  });

  it("logout revokes the session family", async () => {
    const l = await login("viewer@mob.test", "ViewerPass1!");
    const tok = l.body.refreshToken;
    const out = await logoutPost(
      req("/api/mobile/v1/auth/logout", {
        method: "POST",
        body: { refreshToken: tok },
      })
    );
    expect(out.status).toBe(200);
    const after = await refreshPost(
      req("/api/mobile/v1/auth/refresh", {
        method: "POST",
        body: { refreshToken: tok },
      })
    );
    expect(after.status).toBe(401);
  });

  /* ─── Step 4: read APIs ─── */

  it("assigned user sees only assigned sites; unassigned gets nothing", async () => {
    const res = await sitesGet(
      req("/api/mobile/v1/sites", { token: fieldToken })
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.items.map((i: { id: string }) => i.id)).toEqual([site.id]);
    expect(body.items[0].progress).toBeTruthy();
    expect(body.items[0].canUpdate).toBe(true);

    const outsider = await sitesGet(
      req("/api/mobile/v1/sites", { token: unassignedToken })
    );
    const ob = await json(outsider);
    expect(ob.items).toEqual([]);
  });

  it("unassigned user gets 404 on the site detail", async () => {
    const res = await siteGet(
      req(`/api/mobile/v1/sites/${site.id}`, { token: unassignedToken }),
      p({ siteId: site.id })
    );
    expect(res.status).toBe(404);

    const field2 = await siteGet(
      req(`/api/mobile/v1/sites/${site.id}`, { token: fieldToken2 }),
      p({ siteId: site.id })
    );
    expect(field2.status).toBe(404); // assigned to site2 only
  });

  it("hierarchy reads return real ERP data", async () => {
    const w = await wingsGet(
      req(`/api/mobile/v1/sites/${site.id}/wings`, { token: fieldToken }),
      p({ siteId: site.id })
    );
    expect(w.status).toBe(200);
    const wb = await json(w);
    expect(wb.items[0].code).toBe("W1");

    const f = await floorsGet(
      req(`/api/mobile/v1/wings/${wing.id}/floors`, { token: fieldToken }),
      p({ wingId: wing.id })
    );
    expect((await json(f)).items[0].floorIdentifier).toBe("1");

    const fl = await flatsGet(
      req(`/api/mobile/v1/floors/${floor.id}/flats`, { token: fieldToken }),
      p({ floorId: floor.id })
    );
    expect((await json(fl)).items[0].flatNumber).toBe("101");

    const r = await roomsGet(
      req(`/api/mobile/v1/flats/${flat.id}/rooms`, { token: fieldToken }),
      p({ flatId: flat.id })
    );
    const rb = await json(r);
    expect(rb.items.length).toBe(3);

    const a = await activitiesGet(
      req(`/api/mobile/v1/rooms/${room.id}/activities`, {
        token: fieldToken,
      }),
      p({ roomId: room.id })
    );
    const ab = await json(a);
    expect(a.status).toBe(200);
    expect(ab.activities.length).toBe(4);
    expect(ab.activities[0].revision).toBeDefined();
    expect(ab.checklist.templateName).toContain("Mobile Tpl");

    const sum = await summaryGet(
      req("/api/mobile/v1/progress/summary", { token: fieldToken })
    );
    const sb = await json(sum);
    expect(sb.items.length).toBe(1);
    // roomB may also have a checklist from the concurrency test — the
    // important part is the count is computed from real activities.
    expect(sb.items[0].progress.totalActivities).toBeGreaterThanOrEqual(4);
    expect(sb.items[0].progress.configuredRooms).toBeGreaterThanOrEqual(1);
  });

  it("hierarchy node from an unassigned site returns 404", async () => {
    const res = await roomsGet(
      req(`/api/mobile/v1/flats/${flat.id}/rooms`, { token: fieldToken2 }),
      p({ flatId: flat.id })
    );
    expect(res.status).toBe(404);
  });

  /* ─── Step 5: PATCH status ─── */

  it("canUpdate user updates status; room progress returned", async () => {
    const cur = await prisma.progressRoomActivity.findUniqueOrThrow({
      where: { id: activities[1].id },
    });
    const res = await statusPatch(
      req(`/api/mobile/v1/activities/${activities[1].id}/status`, {
        method: "PATCH",
        token: fieldToken,
        body: {
          status: "COMPLETED",
          expectedRevision: cur.revision,
          eventId: `mob-evt-1-${Date.now()}`,
          note: "wiring done",
        },
      }),
      p({ activityId: activities[1].id })
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.status).toBe("COMPLETED");
    expect(body.revision).toBe(cur.revision + 1);
    expect(body.roomProgress.completedActivities).toBe(1);

    const hist = await prisma.progressActivityHistory.findFirst({
      where: { roomActivityId: activities[1].id },
      orderBy: { createdAt: "desc" },
    });
    expect(hist?.changedById).toBe(fieldUser.id);
    expect(hist?.notes).toBe("wiring done");
  });

  it("stale revision returns 409 with current state", async () => {
    const res = await statusPatch(
      req(`/api/mobile/v1/activities/${activities[1].id}/status`, {
        method: "PATCH",
        token: fieldToken,
        body: {
          status: "ON_HOLD",
          expectedRevision: 0, // stale — actual is 1
          eventId: `mob-evt-stale-${Date.now()}`,
        },
      }),
      p({ activityId: activities[1].id })
    );
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error.code).toBe("STALE");
    expect(body.error.current.currentStatus).toBe("COMPLETED");
    expect(body.error.current.currentRevision).toBe(1);
  });

  it("same eventId retried does not double-apply or duplicate history", async () => {
    const cur = await prisma.progressRoomActivity.findUniqueOrThrow({
      where: { id: activities[2].id },
    });
    const eventId = `mob-evt-dup-${Date.now()}`;
    const first = await statusPatch(
      req(`/api/mobile/v1/activities/${activities[2].id}/status`, {
        method: "PATCH",
        token: fieldToken,
        body: {
          status: "IN_PROGRESS",
          expectedRevision: cur.revision,
          eventId,
        },
      }),
      p({ activityId: activities[2].id })
    );
    expect(first.status).toBe(200);

    const replay = await statusPatch(
      req(`/api/mobile/v1/activities/${activities[2].id}/status`, {
        method: "PATCH",
        token: fieldToken,
        body: {
          status: "IN_PROGRESS",
          expectedRevision: cur.revision, // now stale, but replay wins
          eventId,
        },
      }),
      p({ activityId: activities[2].id })
    );
    expect(replay.status).toBe(200);
    const rb = await json(replay);
    expect(rb.alreadyApplied).toBe(true);

    const count = await prisma.progressActivityHistory.count({
      where: { eventId },
    });
    expect(count).toBe(1);
  });

  it("view-only user gets 403 on status update", async () => {
    const res = await statusPatch(
      req(`/api/mobile/v1/activities/${activities[3].id}/status`, {
        method: "PATCH",
        token: viewerToken,
        body: {
          status: "COMPLETED",
          expectedRevision: 0,
          eventId: `mob-evt-view-${Date.now()}`,
        },
      }),
      p({ activityId: activities[3].id })
    );
    expect(res.status).toBe(403);
  });

  it("unassigned user gets 404 on status update", async () => {
    const res = await statusPatch(
      req(`/api/mobile/v1/activities/${activities[3].id}/status`, {
        method: "PATCH",
        token: unassignedToken,
        body: {
          status: "COMPLETED",
          expectedRevision: 0,
          eventId: `mob-evt-out-${Date.now()}`,
        },
      }),
      p({ activityId: activities[3].id })
    );
    expect(res.status).toBe(404);
  });

  it("two users update different activities concurrently — both apply", async () => {
    // fieldUser on site, fieldUser2 on site2 — simulate two managers on
    // different activities of the same site by giving fieldUser2 access
    await prisma.progressSiteAssignment.create({
      data: {
        siteId: site.id,
        userId: fieldUser2.id,
        canView: true,
        canUpdate: true,
        assignedById: adminUser.id,
      },
    });
    // dedicated room + checklist so this test is order-independent
    const concRoom = await prisma.progressRoom.create({
      data: { flatId: flat.id, roomName: "Concurrent Room" },
    });
    const conc = await assignRoomChecklist({
      roomId: concRoom.id,
      templateId: template.id,
    });
    expect(conc.success).toBe(true);
    const [a1, a2] = await prisma.progressRoomActivity.findMany({
      where: {
        roomChecklist: { roomId: concRoom.id, isActive: true },
      },
      orderBy: { displayOrder: "asc" },
      take: 2,
    });
    expect(a2).toBeTruthy();
    const [r1, r2] = await Promise.all([
      statusPatch(
        req(`/api/mobile/v1/activities/${a1.id}/status`, {
          method: "PATCH",
          token: fieldToken,
          body: {
            status: "COMPLETED",
            expectedRevision: a1.revision,
            eventId: `c1-${Date.now()}`,
          },
        }),
        p({ activityId: a1.id })
      ),
      statusPatch(
        req(`/api/mobile/v1/activities/${a2.id}/status`, {
          method: "PATCH",
          token: fieldToken2,
          body: {
            status: "COMPLETED",
            expectedRevision: a2.revision,
            eventId: `c2-${Date.now()}`,
          },
        }),
        p({ activityId: a2.id })
      ),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const updated = await prisma.progressRoomActivity.findMany({
      where: { id: { in: [a1.id, a2.id] } },
    });
    expect(updated.every((u) => u.status === "COMPLETED")).toBe(true);
  });

  /* ─── Step 6/7: photos ─── */

  function photoForm(
    targetType: string,
    targetId: string,
    bytes: Buffer,
    extra: Record<string, string> = {},
    filename = "shot.png"
  ) {
    const fd = new FormData();
    fd.append(
      "file",
      new File([new Uint8Array(bytes)], filename, { type: "image/png" })
    );
    fd.append("targetType", targetType);
    fd.append("targetId", targetId);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    return fd;
  }

  it("photo upload works at SITE, FLAT, ROOM and ACTIVITY levels", async () => {
    for (const [tt, tid] of [
      ["SITE", site.id],
      ["FLAT", flat.id],
      ["ROOM", room.id],
      ["ACTIVITY", activities[0].id],
    ] as const) {
      const res = await photoPost(
        req("/api/mobile/v1/photos", {
          method: "POST",
          token: fieldToken,
          body: photoForm(tt, tid, PNG_1PX, { caption: `${tt} shot` }),
        })
      );
      expect(res.status).toBe(201);
      const body = await json(res);
      expect(body.photo.targetType).toBe(tt);
      expect(body.photo.siteId).toBe(site.id);
      if (tt === "ACTIVITY") {
        expect(body.photo.roomActivityId).toBe(activities[0].id);
        expect(body.photo.roomId).toBe(room.id);
        expect(body.photo.flatId).toBe(flat.id);
      }
      const row = await prisma.progressPhoto.findUniqueOrThrow({
        where: { id: body.photo.id },
      });
      uploadedStorageKeys.push(row.storageKey);
    }
    const count = await prisma.progressPhoto.count({
      where: { siteId: site.id },
    });
    expect(count).toBe(4);
  });

  it("rejects non-image content (SVG/EXE) and spoofed mime", async () => {
    for (const bad of [SVG_BYTES, EXE_BYTES]) {
      const res = await photoPost(
        req("/api/mobile/v1/photos", {
          method: "POST",
          token: fieldToken,
          body: photoForm("SITE", site.id, bad, {}, "evil.svg"),
        })
      );
      expect(res.status).toBe(400);
    }
  });

  it("unassigned + view-only users cannot upload", async () => {
    const outsider = await photoPost(
      req("/api/mobile/v1/photos", {
        method: "POST",
        token: unassignedToken,
        body: photoForm("SITE", site.id, PNG_1PX),
      })
    );
    expect(outsider.status).toBe(404);

    const viewer = await photoPost(
      req("/api/mobile/v1/photos", {
        method: "POST",
        token: viewerToken,
        body: photoForm("SITE", site.id, PNG_1PX),
      })
    );
    expect(viewer.status).toBe(403);
  });

  it("clientEventId retry does not create a duplicate photo", async () => {
    const evt = `photo-evt-${Date.now()}`;
    const fd = () =>
      photoForm("ROOM", room.id, PNG_1PX, { clientEventId: evt });
    const r1 = await photoPost(
      req("/api/mobile/v1/photos", {
        method: "POST",
        token: fieldToken,
        body: fd(),
      })
    );
    const r2 = await photoPost(
      req("/api/mobile/v1/photos", {
        method: "POST",
        token: fieldToken,
        body: fd(),
      })
    );
    expect(r2.status).toBe(200);
    const b2 = await json(r2);
    expect(b2.alreadyUploaded).toBe(true);
    const count = await prisma.progressPhoto.count({
      where: { clientEventId: evt },
    });
    expect(count).toBe(1);
  });

  it("photo list + authenticated content endpoints work", async () => {
    const list = await photosGet(
      req(
        `/api/mobile/v1/photos?targetType=ROOM&targetId=${room.id}`,
        { token: fieldToken }
      )
    );
    expect(list.status).toBe(200);
    const lb = await json(list);
    expect(lb.items.length).toBeGreaterThanOrEqual(1);
    expect(lb.items[0].targetType).toBe("ROOM");

    const content = await photoContentGet(
      req(`/api/mobile/v1/photos/${lb.items[0].id}/content`, {
        token: fieldToken,
      }),
      p({ photoId: lb.items[0].id })
    );
    expect(content.status).toBe(200);
    expect(content.headers.get("content-type")).toBe("image/png");
    const buf = Buffer.from(await content.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);

    // unassigned user cannot fetch photo bytes
    const denied = await photoContentGet(
      req(`/api/mobile/v1/photos/${lb.items[0].id}/content`, {
        token: unassignedToken,
      }),
      p({ photoId: lb.items[0].id })
    );
    expect(denied.status).toBe(404);
  });

  /* ─── Brick 5D: photo evidence integrity ─── */

  // Each test needs content no earlier test uploaded to the same target —
  // byte-identical re-uploads intentionally dedupe to the same record.
  // JPX(n) appends a byte past the JPEG EOI so every variant hashes
  // differently while still sniffing as a valid JPEG.
  const JPX = (n: number) => Buffer.concat([JPEG_BYTES, Buffer.from([n])]);

  async function uploadAndTrack(
    tt: string,
    tid: string,
    bytes: Buffer,
    extra: Record<string, string> = {},
    filename = "shot.jpg"
  ) {
    const res = await photoPost(
      req("/api/mobile/v1/photos", {
        method: "POST",
        token: fieldToken,
        body: photoForm(tt, tid, bytes, extra, filename),
      })
    );
    return { res, body: await json(res) };
  }

  it("rejects clientEventId reused with different bytes", async () => {
    const evt = `evt-conflict-${Date.now()}`;
    const { res: r1, body: b1 } = await uploadAndTrack(
      "ROOM", room.id, JPX(1), { clientEventId: evt }
    );
    expect(r1.status).toBe(201);
    const row = await prisma.progressPhoto.findUniqueOrThrow({
      where: { id: b1.photo.id },
    });
    uploadedStorageKeys.push(row.storageKey);

    const { res: r2 } = await uploadAndTrack("ROOM", room.id, JPX(2), {
      clientEventId: evt,
    });
    expect(r2.status).toBe(409);
    const after = await prisma.progressPhoto.findUniqueOrThrow({
      where: { id: b1.photo.id },
    });
    expect(after.contentHash).toBe(row.contentHash);
  });

  it("rejects clientEventId reused with a different caption", async () => {
    const evt = `evt-caption-${Date.now()}`;
    const { res: r1 } = await uploadAndTrack("ROOM", roomB.id, JPX(3), {
      clientEventId: evt,
      caption: "original caption",
    });
    expect(r1.status).toBe(201);
    const { res: r2 } = await uploadAndTrack("ROOM", roomB.id, JPX(3), {
      clientEventId: evt,
      caption: "different caption",
    });
    expect(r2.status).toBe(409);
  });

  it("rejects the same clientEventId on a different target", async () => {
    const evt = `evt-xtarget-${Date.now()}`;
    const { res: r1 } = await uploadAndTrack("ROOM", room.id, JPX(4), {
      clientEventId: evt,
    });
    expect(r1.status).toBe(201);
    const { res: r2 } = await uploadAndTrack("ROOM", roomB.id, JPX(4), {
      clientEventId: evt,
    });
    expect(r2.status).toBe(409);
  });

  it("rejects clientEventId reuse by a different user", async () => {
    const evt = `evt-xuser-${Date.now()}`;
    const { res: r1 } = await uploadAndTrack("SITE", site.id, JPX(5), {
      clientEventId: evt,
    });
    expect(r1.status).toBe(201);
    const r2 = await photoPost(
      req("/api/mobile/v1/photos", {
        method: "POST",
        token: fieldToken2,
        body: photoForm("SITE", site.id, JPX(5), { clientEventId: evt }),
      })
    );
    expect(r2.status).toBe(409);
  });

  it("identical bytes at different targets stay distinct records", async () => {
    const { res: r1, body: b1 } = await uploadAndTrack("FLAT", flat.id, JPX(6));
    const { res: r2, body: b2 } = await uploadAndTrack("SITE", site.id, JPX(6));
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(b1.photo.id).not.toBe(b2.photo.id);
    for (const id of [b1.photo.id, b2.photo.id]) {
      const row = await prisma.progressPhoto.findUniqueOrThrow({
        where: { id },
      });
      uploadedStorageKeys.push(row.storageKey);
    }
  });

  it("repairs a missing file only with byte-identical content", async () => {
    const evt = `evt-repair-${Date.now()}`;
    const { res: r1, body: b1 } = await uploadAndTrack(
      "SITE", site.id, JPX(7), { clientEventId: evt, caption: "repair me" }
    );
    expect(r1.status).toBe(201);
    const row = await prisma.progressPhoto.findUniqueOrThrow({
      where: { id: b1.photo.id },
    });
    uploadedStorageKeys.push(row.storageKey);

    // simulate lost bytes
    await deletePhotoFile(row.storageKey);

    // retry with different bytes → 409, file must NOT be replaced
    const { res: bad } = await uploadAndTrack("SITE", site.id, JPX(8), {
      clientEventId: evt,
    });
    expect(bad.status).toBe(409);
    const stillMissing = await photoContentGet(
      req(`/api/mobile/v1/photos/${b1.photo.id}/content`, {
        token: fieldToken,
      }),
      p({ photoId: b1.photo.id })
    );
    expect(stillMissing.status).toBe(404);

    // retry with identical bytes+caption → repaired under same storageKey
    const { res: good, body: gb } = await uploadAndTrack(
      "SITE", site.id, JPX(7), { clientEventId: evt, caption: "repair me" }
    );
    expect(good.status).toBe(200);
    expect(gb.alreadyUploaded).toBe(true);
    const restored = await prisma.progressPhoto.findUniqueOrThrow({
      where: { id: b1.photo.id },
    });
    expect(restored.storageKey).toBe(row.storageKey);
    const content = await photoContentGet(
      req(`/api/mobile/v1/photos/${b1.photo.id}/content`, {
        token: fieldToken,
      }),
      p({ photoId: b1.photo.id })
    );
    expect(content.status).toBe(200);
  });

  it("never restores a soft-deleted photo via clientEventId", async () => {
    const evt = `evt-deleted-${Date.now()}`;
    const { res: r1, body: b1 } = await uploadAndTrack(
      "ROOM", roomB.id, JPX(9), { clientEventId: evt }
    );
    expect(r1.status).toBe(201);
    const row = await prisma.progressPhoto.findUniqueOrThrow({
      where: { id: b1.photo.id },
    });
    uploadedStorageKeys.push(row.storageKey);
    await prisma.progressPhoto.update({
      where: { id: b1.photo.id },
      data: { deletedAt: new Date() },
    });

    const { res: r2 } = await uploadAndTrack("ROOM", roomB.id, JPX(9), {
      clientEventId: evt,
    });
    expect(r2.status).toBe(409);
    const after = await prisma.progressPhoto.findUniqueOrThrow({
      where: { id: b1.photo.id },
    });
    expect(after.deletedAt).not.toBeNull();
    const list = await photosGet(
      req(`/api/mobile/v1/photos?targetType=ROOM&targetId=${roomB.id}`, {
        token: fieldToken,
      })
    );
    const lb = await json(list);
    expect(lb.items.every((i: { id: string }) => i.id !== b1.photo.id)).toBe(
      true
    );
  });

  it("concurrent uploads with the same clientEventId produce one record", async () => {
    const evt = `evt-race-${Date.now()}`;
    const [r1, r2] = await Promise.all([
      photoPost(
        req("/api/mobile/v1/photos", {
          method: "POST",
          token: fieldToken,
          body: photoForm("ROOM", roomB.id, JPX(10), { clientEventId: evt }),
        })
      ),
      photoPost(
        req("/api/mobile/v1/photos", {
          method: "POST",
          token: fieldToken,
          body: photoForm("ROOM", roomB.id, JPX(10), { clientEventId: evt }),
        })
      ),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(201);
    const rows = await prisma.progressPhoto.findMany({
      where: { clientEventId: evt },
    });
    expect(rows).toHaveLength(1);
    uploadedStorageKeys.push(rows[0].storageKey);
  });

  it("progress stays server-authoritative — no manual percentage path exists", async () => {
    // PATCH schema has no percent field — extra keys are stripped by zod
    const cur = await prisma.progressRoomActivity.findUniqueOrThrow({
      where: { id: activities[3].id },
    });
    const res = await statusPatch(
      req(`/api/mobile/v1/activities/${activities[3].id}/status`, {
        method: "PATCH",
        token: fieldToken,
        body: {
          status: "COMPLETED",
          expectedRevision: cur.revision,
          eventId: `mob-evt-pct-${Date.now()}`,
          percent: 100, // ignored — never accepted
        },
      }),
      p({ activityId: activities[3].id })
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    // progress derives from counts, not the supplied percent
    expect(body.roomProgress.percent).not.toBeNull();
    const expected =
      (body.roomProgress.completedActivities /
        body.roomProgress.totalActivities) *
      100;
    expect(body.roomProgress.percent).toBeCloseTo(expected, 6);
  });
});
