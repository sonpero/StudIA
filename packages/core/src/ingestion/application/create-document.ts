import type { IdGenerator } from "../../shared/index.js";
import { nextSubjectColour } from "../domain/colour.js";
import type { DocumentRepository } from "../domain/ports.js";
import type { Document, SourceType } from "../domain/types.js";

export interface CreateDocumentDeps {
  repo: DocumentRepository;
  idGenerator: IdGenerator;
}

// The document row, before any file (docs/modules/ingestion.md).
export async function createDocument(
  deps: CreateDocumentDeps,
  userId: string,
  title: string,
  sourceType: SourceType,
  now: Date,
): Promise<Document> {
  const existingCount = await deps.repo.countDocuments(userId);
  const document: Document = {
    id: deps.idGenerator.next(),
    userId,
    title,
    sourceType,
    status: "pending",
    pageCount: 0,
    colour: nextSubjectColour(existingCount),
    createdAt: now.toISOString(),
  };
  await deps.repo.createDocument(document);
  return document;
}
