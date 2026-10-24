import path from "path";

// Shared storage constants for In-Out Register attachments.
// Private uploads live OUTSIDE public/ and outside .next/, so they are
// never served without the auth checks in /api/in-out-documents and are
// never wiped by `next build` or the standalone bundle copy.
export const INOUT_PRIVATE_PREFIX = "inout-priv/";
export const INOUT_PRIVATE_DIR = path.join(
  process.cwd(),
  "private_uploads",
  "in-out-register"
);
export const INOUT_LEGACY_PUBLIC_DIR = path.join(
  process.cwd(),
  "public",
  "uploads"
);
