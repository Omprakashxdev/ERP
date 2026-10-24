import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { auth } from "@/lib/auth";
import { INOUT_LEGACY_PUBLIC_DIR } from "@/lib/in-out-documents";

// Next standalone only serves public/ files that existed when the process
// started — runtime uploads under public/uploads 404 until restart. This
// route reads from disk on every request, so files are available the moment
// they are uploaded. On production, public/uploads is a symlink to the
// persistent app-root directory, so requests resolve to durable storage.
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path: segments } = await params;
  const rel = segments.join("/");
  const root = path.resolve(INOUT_LEGACY_PUBLIC_DIR);
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const info = await stat(abs).catch(() => null);
  if (!info?.isFile()) {
    return NextResponse.json(
      { error: "This document could not be found on the server." },
      { status: 404 }
    );
  }

  const bytes = await readFile(abs);
  const ext = path.extname(abs).toLowerCase();
  const safeName = path.basename(abs).replace(/"/g, "_");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
    },
  });
}
