import { NextRequest } from "next/server";
import { mobileLogoutSchema } from "@/lib/schemas/mobile";
import { revokeRefreshToken } from "@/lib/mobile/tokens";
import { apiOk, parseJson, rateLimitLogin } from "@/lib/mobile/api";

/**
 * POST /api/mobile/v1/auth/logout
 * { refreshToken } → revokes the whole session family. Idempotent —
 * logging out an unknown token still returns success.
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimitLogin(req);
  if (limited) return limited;

  const parsed = await parseJson(req, mobileLogoutSchema);
  if (!parsed.ok) return parsed.res;

  await revokeRefreshToken(parsed.data.refreshToken);
  return apiOk({ revoked: true });
}
