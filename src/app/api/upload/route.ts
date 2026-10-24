import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, realpath } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { auth } from "@/lib/auth";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx"];
// Module names are per-field ids (e.g. "raBill1Path", "in-out-register-doc").
// A strict slug keeps every legitimate workflow while ruling out traversal,
// separators, absolute paths and hidden path components entirely.
const MODULE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const moduleName = (formData.get("module") as string) ?? "general";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: `File type ${ext} not allowed` }, { status: 400 });
    }

    if (!MODULE_NAME_RE.test(moduleName)) {
      return NextResponse.json({ error: "Invalid module name" }, { status: 400 });
    }

    // Ensure upload directory exists, then verify the real (symlink-resolved)
    // destination still lives inside the upload root — a planted symlink
    // named like a module must not redirect writes outside it.
    const uploadRoot = path.resolve(UPLOAD_DIR);
    const moduleDir = path.join(uploadRoot, moduleName);
    if (!existsSync(moduleDir)) {
      await mkdir(moduleDir, { recursive: true });
    }
    const realRoot = await realpath(uploadRoot);
    const realModuleDir = await realpath(moduleDir);
    if (!realModuleDir.startsWith(realRoot + path.sep)) {
      return NextResponse.json({ error: "Invalid module name" }, { status: 400 });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filename = `${timestamp}_${safeName}`;
    const filePath = path.join(realModuleDir, filename);

    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    // Return the public path
    const publicPath = `/uploads/${moduleName}/${filename}`;

    return NextResponse.json({ path: publicPath, filename: file.name });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
