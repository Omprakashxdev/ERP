import path from "path";
import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, realpath, unlink, writeFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { ProgressPhotoTargetType, ProgressSiteStatus } from "@prisma/client";

/**
 * Progress photo storage + validation.
 *
 * - Files live in private_uploads/progress-photos — outside public/ and
 *   outside the standalone build output, so nothing is ever served
 *   statically or wiped by a rebuild (same persistence safeguard as the
 *   In-Out Register private uploads).
 * - storageKey is a server-generated random relative path; client
 *   filenames and real filesystem paths are never exposed or trusted.
 * - Hierarchy columns on ProgressPhoto are resolved server-side from the
 *   declared target — the client can never spoof ancestry.
 * - Image bytes are validated by magic bytes and rewritten without
 *   metadata segments (JPEG APPn, PNG ancillary chunks, WebP EXIF/XMP),
 *   which strips EXIF/GPS data before storage.
 */

// In standalone mode server.js chdir()s into .next/standalone, so an
// absolute PROGRESS_PHOTO_DIR env override is the only reliable way to
// keep uploads outside the replaceable build directory in production.
export const PROGRESS_PHOTO_DIR = process.env.PROGRESS_PHOTO_DIR
  ? path.resolve(process.env.PROGRESS_PHOTO_DIR)
  : path.join(process.cwd(), "private_uploads", "progress-photos");

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB

export type SniffedImage = "jpeg" | "png" | "webp";

const MIME: Record<SniffedImage, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const EXT: Record<SniffedImage, string> = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
};

/** Detect real image type from magic bytes — extension/mime are untrusted. */
export function sniffImageType(buf: Buffer): SniffedImage | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png";
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export function mimeFor(type: SniffedImage): string {
  return MIME[type];
}

/**
 * Rewrite image bytes without metadata segments so EXIF/GPS data never
 * reaches storage. Falls back to the original bytes when the container is
 * unusual but still a valid image type — sniffing already guarantees the
 * magic bytes, and metadata segments are only dangerous when parsed.
 */
export function stripImageMetadata(buf: Buffer, type: SniffedImage): Buffer {
  try {
    if (type === "jpeg") return stripJpeg(buf);
    if (type === "png") return stripPng(buf);
    if (type === "webp") return stripWebp(buf);
  } catch {
    return buf;
  }
  return buf;
}

// JPEG: keep SOI + APP0 (JFIF) + APP14 (Adobe color) + DQT/SOF/DHT/DRI/SOS/
// EOI and entropy data; drop APP1–APP13/APP15 and COM (EXIF, XMP, IPTC).
function stripJpeg(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let i = 2;
  let sosSeen = false;
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      // Entropy-coded data after SOS — copy the rest verbatim.
      out.push(buf.subarray(i));
      break;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      // Standalone markers (SOI inside stream / TEM / RSTn)
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marker === 0xda) {
      // SOS: copy header + remaining entropy data verbatim.
      const len = buf.readUInt16BE(i + 2);
      out.push(buf.subarray(i, i + 2 + len));
      out.push(buf.subarray(i + 2 + len));
      sosSeen = true;
      break;
    }
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.subarray(i, i + 2 + len);
    const keep =
      marker === 0xe0 || // APP0 JFIF
      marker === 0xee || // APP14 Adobe
      marker === 0xdb || // DQT
      marker === 0xc4 || // DHT
      marker === 0xdd || // DRI
      (marker >= 0xc0 && marker <= 0xcf); // SOF/DAC family (not DHT/DQT/SOS handled above)
    if (keep) out.push(seg);
    i += 2 + len;
  }
  return sosSeen || out.length > 1 ? Buffer.concat(out) : buf;
}

// PNG: keep only critical chunks (chunk type starting with an uppercase
// letter = IHDR, PLTE, IDAT, IEND). Drops eXIf, tEXt, zTXt, iTXt, tIME etc.
function stripPng(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 8)]; // signature
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("ascii", i + 4, i + 8);
    const chunkEnd = i + 12 + len; // len + type + data + crc
    if (chunkEnd > buf.length) break;
    if (type[0] === type[0].toUpperCase()) {
      out.push(buf.subarray(i, chunkEnd));
    }
    i = chunkEnd;
    if (type === "IEND") break;
  }
  return Buffer.concat(out);
}

// WebP: keep VP8X (container flags), ICCP (color), VP8/VP8L, ALPH, ANIM,
// ANMF; drop EXIF and XMP  chunks. Rebuild the RIFF header.
function stripWebp(buf: Buffer): Buffer {
  const KEEP = new Set(["VP8 ", "VP8L", "VP8X", "ICCP", "ALPH", "ANIM", "ANMF"]);
  const chunks: Buffer[] = [];
  let i = 12; // skip "RIFF" + size + "WEBP"
  while (i + 8 <= buf.length) {
    const fourcc = buf.toString("ascii", i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const padded = size + (size % 2);
    const end = i + 8 + padded;
    if (end > buf.length) break;
    if (KEEP.has(fourcc)) chunks.push(buf.subarray(i, end));
    i = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(4 + body.length, 4);
  header.write("WEBP", 8, "ascii");
  return Buffer.concat([header, body]);
}

export function contentHashOf(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function newStorageKey(type: SniffedImage): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}/${mm}/${randomUUID()}${EXT[type]}`;
}

/** Resolve a storageKey to a verified path inside the photo root. */
export async function pathForStorageKey(
  storageKey: string
): Promise<string | null> {
  if (!/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(storageKey)) {
    return null;
  }
  const root = await realpath(PROGRESS_PHOTO_DIR).catch(() => null);
  if (!root) return null;
  const abs = path.resolve(root, storageKey);
  if (!abs.startsWith(root + path.sep)) return null;
  const real = await realpath(abs).catch(() => null);
  if (!real || !real.startsWith(root + path.sep)) return null;
  return real;
}

export async function writePhotoFile(
  storageKey: string,
  bytes: Buffer
): Promise<string> {
  const dir = path.join(PROGRESS_PHOTO_DIR, path.dirname(storageKey));
  await mkdir(dir, { recursive: true });
  const root = await realpath(PROGRESS_PHOTO_DIR);
  const abs = path.join(root, storageKey);
  const realDir = await realpath(dir);
  if (!realDir.startsWith(root + path.sep)) {
    throw new Error("Photo storage path escaped the upload root.");
  }
  await writeFile(abs, bytes);
  return abs;
}

export async function readPhotoFile(storageKey: string): Promise<Buffer | null> {
  const abs = await pathForStorageKey(storageKey);
  if (!abs) return null;
  return readFile(abs).catch(() => null);
}

export async function deletePhotoFile(storageKey: string): Promise<void> {
  const abs = await pathForStorageKey(storageKey);
  if (abs) await unlink(abs).catch(() => {});
}

export interface ResolvedPhotoTarget {
  siteId: string;
  flatId: string | null;
  roomId: string | null;
  roomActivityId: string | null;
  /** False when any ancestor is deactivated or the site is archived. */
  chainActive: boolean;
}

/**
 * Server-side target resolution — the client declares targetType+targetId,
 * every ancestor id is derived here and never taken from the request.
 */
export async function resolvePhotoTarget(
  targetType: ProgressPhotoTargetType,
  targetId: string
): Promise<ResolvedPhotoTarget | null> {
  switch (targetType) {
    case "SITE": {
      const site = await prisma.progressSite.findUnique({
        where: { id: targetId },
        select: { id: true, status: true },
      });
      if (!site) return null;
      return {
        siteId: site.id,
        flatId: null,
        roomId: null,
        roomActivityId: null,
        chainActive: site.status !== ProgressSiteStatus.ARCHIVED,
      };
    }
    case "FLAT": {
      const flat = await prisma.progressFlat.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          isActive: true,
          floor: {
            select: {
              isActive: true,
              wing: {
                select: {
                  isActive: true,
                  siteId: true,
                  site: { select: { status: true } },
                },
              },
            },
          },
        },
      });
      if (!flat) return null;
      const { wing } = flat.floor;
      return {
        siteId: wing.siteId,
        flatId: flat.id,
        roomId: null,
        roomActivityId: null,
        chainActive:
          flat.isActive &&
          flat.floor.isActive &&
          wing.isActive &&
          wing.site.status !== ProgressSiteStatus.ARCHIVED,
      };
    }
    case "ROOM": {
      const room = await prisma.progressRoom.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          isActive: true,
          flat: {
            select: {
              id: true,
              isActive: true,
              floor: {
                select: {
                  isActive: true,
                  wing: {
                    select: {
                      isActive: true,
                      siteId: true,
                      site: { select: { status: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!room) return null;
      const { flat } = room;
      const { wing } = flat.floor;
      return {
        siteId: wing.siteId,
        flatId: flat.id,
        roomId: room.id,
        roomActivityId: null,
        chainActive:
          room.isActive &&
          flat.isActive &&
          flat.floor.isActive &&
          wing.isActive &&
          wing.site.status !== ProgressSiteStatus.ARCHIVED,
      };
    }
    case "ACTIVITY": {
      const act = await prisma.progressRoomActivity.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          isActive: true,
          roomChecklist: {
            select: {
              isActive: true,
              roomId: true,
              room: {
                select: {
                  isActive: true,
                  flat: {
                    select: {
                      id: true,
                      isActive: true,
                      floor: {
                        select: {
                          isActive: true,
                          wing: {
                            select: {
                              isActive: true,
                              siteId: true,
                              site: { select: { status: true } },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!act) return null;
      const cl = act.roomChecklist;
      const { flat } = cl.room;
      const { wing } = flat.floor;
      return {
        siteId: wing.siteId,
        flatId: flat.id,
        roomId: cl.roomId,
        roomActivityId: act.id,
        chainActive:
          act.isActive &&
          cl.isActive &&
          cl.room.isActive &&
          flat.isActive &&
          flat.floor.isActive &&
          wing.isActive &&
          wing.site.status !== ProgressSiteStatus.ARCHIVED,
      };
    }
    default:
      return null;
  }
}
