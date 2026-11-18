import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/lib/mobile/tokens";
import { rateLimitMobile, rateLimitByIp } from "@/lib/rate-limit";

/**
 * Shared guards + response contract for /api/mobile/v1 routes.
 *
 * Every route is guarded by requireMobileUser (bearer access token +
 * per-request user.isActive check — disabled users lose access
 * immediately) and, for site-scoped resources, requireSiteScope
 * (assignment row with canView for reads / canUpdate for writes —
 * mobile permissions are never implied by the ERP role).
 */

export interface MobileUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export function apiError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...extra } },
    { status }
  );
}

export function apiOk(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export async function parseJson<T extends z.ZodType>(
  req: NextRequest,
  schema: T
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: NextResponse }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false, res: apiError(400, "BAD_JSON", "Request body must be valid JSON.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".") || "body";
    return {
      ok: false,
      res: apiError(400, "VALIDATION", `${field}: ${issue?.message ?? "invalid"}`),
    };
  }
  return { ok: true, data: parsed.data };
}

export function formatZodError(e: ZodError): string {
  const issue = e.issues[0];
  return `${issue?.path.join(".") || "value"}: ${issue?.message ?? "invalid"}`;
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Bearer-token auth + live user.isActive check. */
export async function requireMobileUser(
  req: NextRequest
): Promise<{ ok: true; user: MobileUser } | { ok: false; res: NextResponse }> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return { ok: false, res: apiError(401, "UNAUTHENTICATED", "Missing bearer token.") };
  }
  const claims = await verifyAccessToken(token);
  if (!claims) {
    return {
      ok: false,
      res: apiError(401, "TOKEN_INVALID", "Access token is invalid or expired."),
    };
  }
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) {
    return {
      ok: false,
      res: apiError(401, "USER_DISABLED", "This account is no longer active."),
    };
  }
  const rl = await rateLimitMobile(`mob:${user.id}`);
  if (!rl.success) {
    return { ok: false, res: apiError(429, "RATE_LIMITED", "Too many requests.") };
  }
  return { ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

export async function rateLimitLogin(req: NextRequest): Promise<NextResponse | null> {
  const rl = await rateLimitByIp(`mob-login:${clientIp(req)}`);
  if (!rl.success) {
    return apiError(429, "RATE_LIMITED", "Too many login attempts. Try again later.");
  }
  return null;
}

/**
 * Site-scope enforcement. Returns the assignment or a 403/404 response.
 * write=true requires canUpdate; reads require canView (default).
 * A revoked or absent assignment denies access regardless of ERP role.
 */
export async function requireSiteScope(
  userId: string,
  siteId: string,
  opts: { write?: boolean } = {}
): Promise<
  | { ok: true; assignment: { canView: boolean; canUpdate: boolean } }
  | { ok: false; res: NextResponse }
> {
  const assignment = await prisma.progressSiteAssignment.findUnique({
    where: { siteId_userId: { siteId, userId } },
    select: { canView: true, canUpdate: true, isActive: true },
  });
  if (!assignment || !assignment.isActive) {
    // 404 rather than 403 — an unassigned user must not learn that the
    // site id exists.
    return { ok: false, res: apiError(404, "NOT_FOUND", "Site not found.") };
  }
  if (opts.write) {
    if (!assignment.canUpdate) {
      return {
        ok: false,
        res: apiError(403, "FORBIDDEN", "You do not have update permission on this site."),
      };
    }
  } else if (!assignment.canView) {
    return { ok: false, res: apiError(404, "NOT_FOUND", "Site not found.") };
  }
  return { ok: true, assignment: { canView: assignment.canView, canUpdate: assignment.canUpdate } };
}

/** Resolve a hierarchy node to its owning siteId (null if unknown). */
export async function siteIdOf(
  kind: "wing" | "floor" | "flat" | "room" | "activity",
  id: string
): Promise<string | null> {
  switch (kind) {
    case "wing": {
      const n = await prisma.progressWing.findUnique({
        where: { id },
        select: { siteId: true },
      });
      return n?.siteId ?? null;
    }
    case "floor": {
      const n = await prisma.progressFloor.findUnique({
        where: { id },
        select: { wing: { select: { siteId: true } } },
      });
      return n?.wing.siteId ?? null;
    }
    case "flat": {
      const n = await prisma.progressFlat.findUnique({
        where: { id },
        select: { floor: { select: { wing: { select: { siteId: true } } } } },
      });
      return n?.floor.wing.siteId ?? null;
    }
    case "room": {
      const n = await prisma.progressRoom.findUnique({
        where: { id },
        select: {
          flat: { select: { floor: { select: { wing: { select: { siteId: true } } } } } },
        },
      });
      return n?.flat.floor.wing.siteId ?? null;
    }
    case "activity": {
      const n = await prisma.progressRoomActivity.findUnique({
        where: { id },
        select: {
          roomChecklist: {
            select: {
              room: {
                select: {
                  flat: {
                    select: { floor: { select: { wing: { select: { siteId: true } } } } },
                  },
                },
              },
            },
          },
        },
      });
      return n?.roomChecklist.room.flat.floor.wing.siteId ?? null;
    }
  }
}

/** Cursor-free pagination: ?page=&pageSize= (bounded). */
export function pageParams(
  req: NextRequest,
  defaults: { pageSize?: number; maxPageSize?: number } = {}
): { skip: number; take: number; page: number; pageSize: number } | NextResponse {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const raw = Number(url.searchParams.get("pageSize") ?? defaults.pageSize ?? 50) || 50;
  const max = defaults.maxPageSize ?? 100;
  if (raw < 1 || raw > max) {
    return apiError(400, "VALIDATION", `pageSize must be between 1 and ${max}.`);
  }
  return { skip: (page - 1) * raw, take: raw, page, pageSize: raw };
}
