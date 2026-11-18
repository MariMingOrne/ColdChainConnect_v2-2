import { RequestHandler } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { writeFile } from "fs/promises";

const uploadDir = path.join(process.cwd(), "public", "uploads");
mkdirSync(uploadDir, { recursive: true });

const MAX_BYTES = 5 * 1024 * 1024;

/** Identify an image by its first bytes ("magic number"), not by the name the browser sent. */
export function detectImageExtension(bytes: Uint8Array): ".png" | ".jpg" | ".gif" | ".webp" | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === "PNG") return ".png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ".jpg";
  if (bytes.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return ".gif";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return ".webp";
  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

/** Parses a single "file" field and turns multer errors into JSON 400s instead of HTML 500s. */
export const uploadMiddleware: RequestHandler = (req, res, next) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    const message =
      err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
        ? "Image must be 5 MB or smaller"
        : "Could not read the uploaded file";
    res.status(400).json({ error: message });
  });
};

export const handleUpload: RequestHandler = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const ext = detectImageExtension(req.file.buffer);
  if (!ext) {
    return res.status(400).json({ error: "Only PNG, JPEG, GIF or WebP images are allowed" });
  }

  // Server-chosen name: the client's filename never touches the filesystem.
  const filename = `${randomUUID()}${ext}`;
  try {
    await writeFile(path.join(uploadDir, filename), req.file.buffer, { flag: "wx" });
    res.json({ filename });
  } catch (error) {
    console.error("Error saving upload:", error);
    res.status(500).json({ error: "Could not save the image" });
  }
};
