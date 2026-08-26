import { z } from "zod";

export const sourceTypeSchema = z.enum(["photo", "pdf", "docx", "pptx"]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const extractionStatusSchema = z.enum(["pending", "running", "done", "failed"]);
export type ExtractionStatus = z.infer<typeof extractionStatusSchema>;

export const createDocumentRequestSchema = z.object({
  title: z.string().min(1).describe("Course title, editable, defaults to the filename"),
  sourceType: sourceTypeSchema,
});
export type CreateDocumentRequest = z.infer<typeof createDocumentRequestSchema>;

export const documentSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceType: sourceTypeSchema,
  status: extractionStatusSchema,
  pageCount: z.number(),
  colour: z.string(),
  createdAt: z.string(),
});
export type DocumentSummary = z.infer<typeof documentSummarySchema>;

export const documentDetailSchema = documentSummarySchema.extend({
  lastError: z.string().nullable(),
  markdown: z.string().nullable(),
});
export type DocumentDetailResponse = z.infer<typeof documentDetailSchema>;

export const pageSchema = z.object({
  documentId: z.string(),
  index: z.number(),
  sha256: z.string(),
  sizeBytes: z.number(),
});
export type PageResponse = z.infer<typeof pageSchema>;
