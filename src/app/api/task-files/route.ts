import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessTask } from "@/lib/task-access";

// Private storage — NOT under public/, so files are never served
// without the record-level check in the GET route.
const UPLOAD_DIR = path.join(process.cwd(), "private_uploads", "task-attachments");
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const taskId = formData.get("taskId") as string | null;

    if (!file || !taskId) {
      return NextResponse.json({ error: "File and task are required" }, { status: 400 });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { assignedToId: true, assignedById: true, reviewerId: true },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (!(await canAccessTask(session.user, task))) {
      return NextResponse.json(
        { error: "You are not allowed to attach files to this task" },
        { status: 403 }
      );
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

    const dir = path.join(UPLOAD_DIR, taskId);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    const storedName = `${Date.now()}_${safeName}`;
    const absPath = path.join(dir, storedName);
    await writeFile(absPath, Buffer.from(await file.arrayBuffer()));

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId,
        filename: base,
        path: path.join("task-attachments", taskId, storedName),
        size: file.size,
        mimeType: file.type || null,
        uploadedById: session.user.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "create",
        entity: "TaskAttachment",
        entityId: attachment.id,
        metadata: { taskId, filename: base, size: file.size },
      },
    }).catch(() => {});

    return NextResponse.json({
      id: attachment.id,
      filename: attachment.filename,
      size: attachment.size,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
