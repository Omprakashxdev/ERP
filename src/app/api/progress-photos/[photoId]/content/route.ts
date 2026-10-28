import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermissionWithOverrides } from "@/lib/authz";
import { readPhotoFile } from "@/lib/progress-photos";

const paramsSchema = z.object({ photoId: z.string().min(1) });

/**
 * GET /api/progress-photos/:photoId/content — ERP session-authenticated
 * photo bytes for the read-only galleries. Requires progressApp read.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role ?? "STAFF";
  if (!(await hasPermissionWithOverrides(role as never, "progressApp", "read"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { photoId } = paramsSchema.parse(await params);
  const photo = await prisma.progressPhoto.findUnique({
    where: { id: photoId },
    select: { storageKey: true, mimeType: true, deletedAt: true },
  });
  if (!photo || photo.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bytes = await readPhotoFile(photo.storageKey);
  if (!bytes) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
