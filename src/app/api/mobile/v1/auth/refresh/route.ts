import { NextRequest } from "next/server";
import { mobileRefreshSchema } from "@/lib/schemas/mobile";
import { rotateRefreshToken, signAccessToken } from "@/lib/mobile/tokens";
import { apiError, apiOk, parseJson, rateLimitLogin } from "@/lib/mobile/api";

/**
 * POST /api/mobile/v1/auth/refresh
 * { refreshToken, deviceLabel? } → rotated pair. The old refresh token is
 * single-use — replaying it revokes the whole session family.
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimitLogin(req);
  if (limited) return limited;

  const parsed = await parseJson(req, mobileRefreshSchema);
  if (!parsed.ok) return parsed.res;
  const { refreshToken, deviceLabel } = parsed.data;

  const rotation = await rotateRefreshToken(refreshToken, deviceLabel);
  if (!rotation.ok) {
    return apiError(
      401,
      rotation.reason === "reused" ? "TOKEN_REUSED" : "TOKEN_INVALID",
      rotation.reason === "reused"
        ? "Refresh token reuse detected — session revoked."
        : "Refresh token is invalid, expired or revoked."
    );
  }

  const access = await signAccessToken(rotation.userId, rotation.role);
  return apiOk({
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    tokenType: "Bearer",
    refreshToken: rotation.token.token,
    refreshTokenExpiresAt: rotation.token.record.expiresAt.toISOString(),
  });
}
