import type { CreateDocumentRequest, DocumentDetailResponse, DocumentSummary } from "@studia/contracts";
import { apiFetch } from "./api-client.js";

export async function listDocuments(): Promise<DocumentSummary[]> {
  const res = await apiFetch("/api/documents");
  if (!res.ok) throw new Error("Impossible de charger tes cours.");
  return res.json() as Promise<DocumentSummary[]>;
}

export async function getDocument(id: string): Promise<DocumentDetailResponse> {
  const res = await apiFetch(`/api/documents/${id}`);
  if (!res.ok) throw new Error("Ce cours est introuvable.");
  return res.json() as Promise<DocumentDetailResponse>;
}

export async function createDocument(body: CreateDocumentRequest): Promise<DocumentSummary> {
  const res = await apiFetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Impossible de créer le cours.");
  return res.json() as Promise<DocumentSummary>;
}

export type UploadPageError = "unsupported" | "too-large" | "duplicate" | "unknown";

export async function uploadPage(documentId: string, file: File): Promise<{ ok: true } | { ok: false; error: UploadPageError }> {
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await apiFetch(`/api/documents/${documentId}/pages`, { method: "POST", body: form });
  if (res.ok) return { ok: true };
  if (res.status === 413) return { ok: false, error: "too-large" };
  if (res.status === 409) return { ok: false, error: "duplicate" };
  if (res.status === 400) return { ok: false, error: "unsupported" };
  return { ok: false, error: "unknown" };
}

export async function startExtraction(documentId: string): Promise<void> {
  const res = await apiFetch(`/api/documents/${documentId}/extract`, { method: "POST" });
  if (!res.ok) throw new Error("Impossible de lancer la lecture du cours.");
}

export async function retryExtraction(documentId: string): Promise<void> {
  const res = await apiFetch(`/api/documents/${documentId}/retry`, { method: "POST" });
  if (!res.ok) throw new Error("Impossible de relancer la lecture du cours.");
}

export async function deleteDocument(documentId: string): Promise<void> {
  const res = await apiFetch(`/api/documents/${documentId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Impossible de supprimer ce cours.");
}
