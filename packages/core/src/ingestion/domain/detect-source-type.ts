import { err, ok, type Result } from "../../shared/index.js";
import type { SourceType } from "./types.js";

const MIME_TO_SOURCE_TYPE: Record<string, SourceType> = {
  "image/jpeg": "photo",
  "image/png": "photo",
  "image/webp": "photo",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

// MIME type is authoritative; filename is not currently used to override it
// (a `.pdf` that is actually a PNG must classify as `photo`, not `pdf`) —
// kept as a parameter per docs/modules/ingestion.md's signature, for a
// future fallback when the MIME type itself is generic/absent.
export function detectSourceType(mimeType: string, _filename: string): Result<SourceType, "unsupported"> {
  const sourceType = MIME_TO_SOURCE_TYPE[mimeType];
  return sourceType ? ok(sourceType) : err("unsupported");
}
