import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermissionWithOverrides } from "@/lib/authz";
import { readPhotoFile, sniffImageType, mimeFor } from "@/lib/progress-photos";

const paramsSchema = z.object({ siteId: z.string().min(1) });

/**
 * GET /api/site-covers/:siteId — ERP session-authenticated site cover
 * bytes. coverImagePath is a server-generated storageKey validated and
 * realpath-contained before reading — no client path input.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role ?? "STAFF";
  if (!(await hasPermissionWithOverrides(role as never, "progressApp", "read"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { siteId } = paramsSchema.parse(await params);
  const site = await prisma.progressSite.findUnique({
    where: { id: siteId },
    select: { coverImagePath: true },
  });
  if (!site?.coverImagePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bytes = await readPhotoFile(site.coverImagePath);
  if (!bytes) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const type = sniffImageType(bytes);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type ? mimeFor(type) : "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
