import type { CreateDocumentRequest } from "@studia/contracts";

const MIME_TO_SOURCE_TYPE: Record<string, CreateDocumentRequest["sourceType"]> = {
  "image/jpeg": "photo",
  "image/png": "photo",
  "image/webp": "photo",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

// Client-side guess only, from the first staged file's MIME type; the
// server is the real authority (packages/core/src/ingestion/domain/detect-source-type.ts)
// and rejects anything it doesn't recognise.
export function guessSourceType(file: File): CreateDocumentRequest["sourceType"] | null {
  return MIME_TO_SOURCE_TYPE[file.type] ?? null;
}
