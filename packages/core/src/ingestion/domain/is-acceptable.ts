const MAX_BYTES_PER_PAGE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

// Allow-list of MIME types, never an extension-only check
// (docs/modules/ingestion.md).
export function isAcceptable(sizeBytes: number, mimeType: string): boolean {
  return sizeBytes > 0 && sizeBytes <= MAX_BYTES_PER_PAGE && ALLOWED_MIME_TYPES.has(mimeType);
}
