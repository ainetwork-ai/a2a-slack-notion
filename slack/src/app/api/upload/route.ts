import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const ALLOWED_EXTENSIONS = new Set([
  // Images
  "jpg", "jpeg", "png", "gif", "webp", "svg",
  // Documents
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv",
  // Archives
  "zip", "tar", "gz",
]);

const ALLOWED_MIME_PREFIXES = [
  "image/",
];

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-tar",
  "application/gzip",
  "application/x-gzip",
]);

function isAllowedFile(file: File): { allowed: boolean; reason?: string } {
  if (file.size > MAX_FILE_SIZE) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return { allowed: false, reason: `File size ${mb}MB exceeds the 25MB limit` };
  }

  const ext = path.extname(file.name).toLowerCase().replace(".", "");
  const mimeType = file.type.toLowerCase();

  const extAllowed = ALLOWED_EXTENSIONS.has(ext);
  const mimeAllowed =
    ALLOWED_MIME_PREFIXES.some((p) => mimeType.startsWith(p)) ||
    ALLOWED_MIME_TYPES.has(mimeType) ||
    mimeType === ""; // some browsers don't set mime for dragged files

  if (!extAllowed) {
    return {
      allowed: false,
      reason: `File type ".${ext}" is not allowed. Allowed types: images, PDFs, Office documents, text files, and archives (zip, tar, gz)`,
    };
  }

  if (!mimeAllowed && mimeType !== "") {
    return {
      allowed: false,
      reason: `File type "${mimeType}" is not allowed`,
    };
  }

  return { allowed: true };
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  const check = isAllowedFile(file);
  if (!check.allowed) {
    const status = file.size > MAX_FILE_SIZE ? 413 : 415;
    return NextResponse.json({ error: check.reason }, { status });
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(file.name, file, { access: "public" });
    return NextResponse.json(
      { url: blob.url, fileName: file.name, size: file.size, mimeType: file.type },
      { status: 201 }
    );
  }

  // Local fallback: save to public/uploads/
  const ext = path.extname(file.name) || "";
  const uniqueName = `${randomUUID()}${ext}`;
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, uniqueName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return NextResponse.json(
    { url: `/uploads/${uniqueName}`, fileName: file.name, size: file.size, mimeType: file.type },
    { status: 201 }
  );
}
