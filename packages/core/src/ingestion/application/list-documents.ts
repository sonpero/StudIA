import type { JobQueue } from "../../jobs/index.js";
import type { DocumentRepository } from "../domain/ports.js";
import type { Document } from "../domain/types.js";

export interface ListDocumentsDeps {
  repo: DocumentRepository;
  jobQueue: JobQueue;
}

export async function listDocuments(deps: ListDocumentsDeps, userId: string): Promise<Document[]> {
  const [documents, jobs] = await Promise.all([deps.repo.listDocuments(userId), deps.jobQueue.listJobs(userId, "extract-document")]);

  const latestJobByDocumentId = new Map<string, (typeof jobs)[number]>();
  for (const job of jobs) {
    const payload = job.payload as { documentId?: unknown };
    if (typeof payload.documentId === "string" && !latestJobByDocumentId.has(payload.documentId)) {
      latestJobByDocumentId.set(payload.documentId, job);
    }
  }

  return documents.map((document) => {
    const latest = latestJobByDocumentId.get(document.id);
    return latest ? { ...document, status: latest.status } : document;
  });
}
