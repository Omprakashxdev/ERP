import { createHash, randomBytes, randomUUID } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

/**
 * Mobile authentication design (Android app):
 *
 * - Access token: short-lived (15 min) HS256 JWT signed with a dedicated
 *   MOBILE_TOKEN_SECRET (separate from NextAuth's AUTH_SECRET so a leaked
 *   mobile key can never mint ERP web sessions). Stateless — verified by
 *   signature + expiry, with a per-request isActive DB check so disabled
 *   users lose access immediately.
 * - Refresh token: opaque 48-byte random, stored only as a SHA-256 hash.
 *   30-day lifetime, single-use rotation: every refresh mints a new token,
 *   revokes the old one and links the chain via replacedById. All tokens
 *   born from one login share familyId — replay of a revoked token is
 *   reuse, so the whole family is revoked (standard OAuth2 reuse
 *   detection). Logout revokes the family.
 * - Passwords are verified with the same bcrypt hash as ERP login;
 *   hashes are never returned in any response.
 */

export const ACCESS_TOKEN_TTL_SEC = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days
const ISSUER = "saec-erp-mobile";

function tokenSecret(): Uint8Array {
  const secret = process.env.MOBILE_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MOBILE_TOKEN_SECRET is not configured.");
  }
  return new TextEncoder().encode(secret);
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export interface MobileAccessClaims {
  sub: string;
  role: string;
  typ: "acc";
}

export async function signAccessToken(
  userId: string,
  role: string
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SEC * 1000);
  const token = await new SignJWT({ role, typ: "acc" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(tokenSecret());
  return { token, expiresAt };
}

/** Returns claims or null — never throws on bad/expired tokens. */
export async function verifyAccessToken(
  token: string
): Promise<MobileAccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, tokenSecret(), {
      issuer: ISSUER,
    });
    if (payload.typ !== "acc" || !payload.sub || typeof payload.role !== "string") {
      return null;
    }
    return { sub: payload.sub, role: payload.role, typ: "acc" };
  } catch {
    return null;
  }
}

export interface IssuedRefreshToken {
  token: string; // raw opaque token — returned to the client exactly once
  record: { id: string; familyId: string; expiresAt: Date };
}

async function mintRefreshToken(
  userId: string,
  familyId: string,
  deviceLabel?: string
): Promise<IssuedRefreshToken> {
  const raw = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000);
  const record = await prisma.mobileRefreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: sha256(raw),
      deviceLabel: deviceLabel?.slice(0, 120),
      expiresAt,
    },
    select: { id: true, familyId: true, expiresAt: true },
  });
  return { token: raw, record };
}

/** New login: fresh family + first refresh token. */
export async function issueRefreshToken(
  userId: string,
  deviceLabel?: string
): Promise<IssuedRefreshToken> {
  return mintRefreshToken(userId, randomUUID(), deviceLabel);
}

export type RotationResult =
  | { ok: true; token: IssuedRefreshToken; userId: string; role: string }
  | { ok: false; reason: "invalid" | "expired" | "revoked" | "reused" | "user_disabled" };

/**
 * Rotate a refresh token. Reuse of an already-revoked token revokes the
 * entire family — a stolen token can never silently extend a session.
 */
export async function rotateRefreshToken(
  rawToken: string,
  deviceLabel?: string
): Promise<RotationResult> {
  const hash = sha256(rawToken);
  return prisma.$transaction(async (tx) => {
    const record = await tx.mobileRefreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: { select: { id: true, isActive: true, role: true } } },
    });
    if (!record) return { ok: false as const, reason: "invalid" as const };

    if (record.revokedAt) {
      // Reuse detection — kill the whole family.
      await tx.mobileRefreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "reuse_detected" },
      });
      return { ok: false as const, reason: "reused" as const };
    }
    if (record.expiresAt < new Date()) {
      return { ok: false as const, reason: "expired" as const };
    }
    if (!record.user.isActive) {
      return { ok: false as const, reason: "user_disabled" as const };
    }

    const raw = randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000);
    const next = await tx.mobileRefreshToken.create({
      data: {
        userId: record.userId,
        familyId: record.familyId,
        tokenHash: sha256(raw),
        deviceLabel: deviceLabel?.slice(0, 120) ?? record.deviceLabel,
        expiresAt,
      },
      select: { id: true, familyId: true, expiresAt: true },
    });
    await tx.mobileRefreshToken.update({
      where: { id: record.id },
      data: {
        revokedAt: new Date(),
        revokedReason: "rotated",
        replacedById: next.id,
        lastUsedAt: new Date(),
      },
    });
    return {
      ok: true as const,
      token: { token: raw, record: next },
      userId: record.userId,
      role: record.user.role,
    };
  });
}

/** Logout: revoke the presented token's entire family. */
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const hash = sha256(rawToken);
  const record = await prisma.mobileRefreshToken.findUnique({
    where: { tokenHash: hash },
    select: { familyId: true },
  });
  if (!record) return;
  await prisma.mobileRefreshToken.updateMany({
    where: { familyId: record.familyId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: "logout" },
  });
}

/** Administrative kill-switch: revoke every mobile session for a user. */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.mobileRefreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: "user_disabled" },
  });
}
