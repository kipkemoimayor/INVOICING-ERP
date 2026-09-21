import { BadRequestException } from "@nestjs/common";
import { put } from "@vercel/blob";
import { extname } from "path";

export type BlobUploadInput = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
};

export async function uploadToBlob(
  file: BlobUploadInput,
  folder: string,
): Promise<{
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const baseFolder = folder.replace(/^\/+|\/+$/g, "");
  const extension =
    extname(file.originalname ?? "") ||
    (file.mimetype === "application/pdf"
      ? ".pdf"
      : file.mimetype === "image/png"
        ? ".png"
        : file.mimetype === "image/jpeg"
          ? ".jpg"
          : file.mimetype === "image/webp"
            ? ".webp"
            : file.mimetype === "application/msword"
              ? ".doc"
              : file.mimetype ===
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                ? ".docx"
                : "");
  const rawName =
    (file.originalname ? file.originalname.replace(/\.[^/.]+$/, "") : "document")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "document";
  const key = [
    baseFolder,
    `${Date.now()}-${Math.random().toString(36).slice(2)}-${rawName}${extension}`,
  ]
    .filter(Boolean)
    .join("/");

  const blob = await put(key, file.buffer, {
    access: "public",
    contentType: file.mimetype || "application/octet-stream",
    addRandomSuffix: false,
  });

  return {
    url: blob.url,
    fileName: `${rawName}${extension}`,
    mimeType: file.mimetype || "application/octet-stream",
    sizeBytes: file.buffer.byteLength,
  };
}

export async function fetchBlobBuffer(
  url: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  if (!url) {
    throw new BadRequestException("File URL is missing");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new BadRequestException(
      `Unable to fetch document from storage (${response.status})`,
    );
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType:
      response.headers.get("content-type") || "application/octet-stream",
  };
}
