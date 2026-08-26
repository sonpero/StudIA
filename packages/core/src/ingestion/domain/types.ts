export type SourceType = "photo" | "pdf" | "docx" | "pptx";
export type ExtractionStatus = "pending" | "running" | "done" | "failed";

export type Document = {
  id: string;
  userId: string;
  title: string;
  sourceType: SourceType;
  status: ExtractionStatus;
  pageCount: number;
  colour: string;
  createdAt: string;
};

export type Page = { documentId: string; index: number; sha256: string; storedPath: string; sizeBytes: number };
export type Extraction = { documentId: string; markdown: string; extractedAt: string };
