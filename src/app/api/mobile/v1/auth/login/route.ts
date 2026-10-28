import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { mobileLoginSchema } from "@/lib/schemas/mobile";
import { issueRefreshToken, signAccessToken } from "@/lib/mobile/tokens";
import { apiError, apiOk, parseJson, rateLimitLogin } from "@/lib/mobile/api";

/**
 * POST /api/mobile/v1/auth/login
 * { email, password, deviceLabel? } → { accessToken, accessTokenExpiresAt,
 *   refreshToken, user }
 * Verifies the same bcrypt hash as ERP login. The password hash is never
 * exposed and never logged.
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimitLogin(req);
  if (limited) return limited;

  const parsed = await parseJson(req, mobileLoginSchema);
  if (!parsed.ok) return parsed.res;
  const { email, password, deviceLabel } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // Uniform failure — do not reveal whether the account exists.
  const valid =
    user &&
    user.isActive &&
    (await bcrypt.compare(password, user.hashedPassword));
  if (!valid) {
    return apiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const [access, refresh] = await Promise.all([
    signAccessToken(user.id, user.role),
    issueRefreshToken(user.id, deviceLabel),
  ]);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return apiOk({
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    tokenType: "Bearer",
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.record.expiresAt.toISOString(),
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}
