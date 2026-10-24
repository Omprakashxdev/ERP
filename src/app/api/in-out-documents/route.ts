import { NextRequest, NextResponse } from "next/server";
import { readFile, stat, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermissionWithOverrides } from "@/lib/authz";
import {
  INOUT_PRIVATE_PREFIX,
  INOUT_PRIVATE_DIR,
  INOUT_LEGACY_PUBLIC_DIR,
} from "@/lib/in-out-documents";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx"];

const pathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((p) => !p.includes("\0") && !p.includes("\\"), "Invalid path");

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function displayName(fileName: string): string {
  return decodeURIComponent(fileName).replace(/^\d{9,}_/, "");
}

// Resolve a stored path to an absolute file inside an approved root.
// Returns null for anything outside the two known storage schemes.
function resolveStoredPath(storedPath: string): string | null {
  if (storedPath.startsWith(INOUT_PRIVATE_PREFIX)) {
    const fileName = storedPath.slice(INOUT_PRIVATE_PREFIX.length);
    // Private files are stored flat — a filename only, no subdirectories.
    if (!fileName || fileName !== path.basename(fileName)) return null;
    return path.join(INOUT_PRIVATE_DIR, fileName);
  }
  if (storedPath.startsWith("/uploads/")) {
    const abs = path.resolve(
      INOUT_LEGACY_PUBLIC_DIR,
      storedPath.slice("/uploads/".length)
    );
    if (!abs.startsWith(path.resolve(INOUT_LEGACY_PUBLIC_DIR) + path.sep)) {
      return null;
    }
    return abs;
  }
  return null;
}

/**
 * Document-level authorization. The app's In-Out Register model is
 * module-scoped (any role with inOutRegister read can read any entry),
 * so a SAVED attachment is viewable by any register reader — but only
 * if the exact stored path is actually linked to a register document.
 * An UNSAVED private file is viewable only by the user who uploaded it.
 */
async function isAuthorizedForPath(
  storedPath: string,
  userId: string
): Promise<boolean> {
  const linked = await prisma.inOutRegisterDocument.findFirst({
    where: { path: storedPath },
    select: { id: true },
  });
  if (linked) return true;

  if (storedPath.startsWith(INOUT_PRIVATE_PREFIX)) {
    const pending = await prisma.pendingInOutUpload.findUnique({
      where: { storedName: storedPath.slice(INOUT_PRIVATE_PREFIX.length) },
      select: { uploadedById: true },
    });
    return pending?.uploadedById === userId;
  }

  // Legacy /uploads/ paths with no register link are NOT served — this
  // endpoint must not become a general public-uploads file browser.
  return false;
}

async function serveFile(req: NextRequest, userId: string) {
  const parsed = pathSchema.safeParse(req.nextUrl.searchParams.get("path") ?? "");
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid document reference" }, { status: 400 });
  }
  const storedPath = parsed.data;
  const abs = resolveStoredPath(storedPath);
  if (!abs) {
    return NextResponse.json({ error: "Invalid document reference" }, { status: 400 });
  }

  if (!(await isAuthorizedForPath(storedPath, userId))) {
    return NextResponse.json(
      { error: "You are not allowed to view this document" },
      { status: 403 }
    );
  }

  const fileName = displayName(path.basename(abs));

  // Lightweight existence check so the preview dialog can show a clear
  // error state without downloading the file.
  if (req.nextUrl.searchParams.get("meta") === "1") {
    try {
      const info = await stat(abs);
      return NextResponse.json({ filename: fileName, size: info.size });
    } catch {
      return NextResponse.json(
        { error: "This document could not be found on the server." },
        { status: 404 }
      );
    }
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(abs);
  } catch {
    return NextResponse.json(
      { error: "This document could not be found on the server." },
      { status: 404 }
    );
  }

  const ext = path.extname(abs).toLowerCase();
  const download = req.nextUrl.searchParams.get("download") === "1";
  const safeName = fileName.replace(/"/g, "_");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermissionWithOverrides(session.user.role, "inOutRegister", "read"))) {
    return NextResponse.json(
      { error: "You are not allowed to view this document" },
      { status: 403 }
    );
  }
  return serveFile(req, session.user.id);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermissionWithOverrides(session.user.role, "inOutRegister", "create"))) {
    return NextResponse.json(
      { error: "You are not allowed to attach documents" },
      { status: 403 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: `File type ${ext} not allowed` }, { status: 400 });
    }

    // Sanitize: strip directory components + non-safe chars (path traversal)
    const base = path.basename(file.name);
    const safeName = base.replace(/[^a-zA-Z0-9._-]/g, "_");
    if (!safeName || safeName.startsWith(".")) {
      return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    }

    if (!existsSync(INOUT_PRIVATE_DIR)) await mkdir(INOUT_PRIVATE_DIR, { recursive: true });
    const storedName = `${Date.now()}_${safeName}`;
    await writeFile(path.join(INOUT_PRIVATE_DIR, storedName), Buffer.from(await file.arrayBuffer()));

    // Bind the file to this uploader until it is linked to a register
    // entry on save — knowing the filename grants nobody else access.
    await prisma.pendingInOutUpload.create({
      data: { storedName, uploadedById: session.user.id },
    });

    return NextResponse.json({
      path: `${INOUT_PRIVATE_PREFIX}${storedName}`,
      filename: base,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
