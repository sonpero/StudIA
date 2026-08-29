import { apiFetch } from "./api-client.js";

export async function setDeadline(documentId: string, date: string, label?: string): Promise<void> {
  const res = await apiFetch(`/api/documents/${documentId}/deadline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(label ? { date, label } : { date }),
  });
  if (!res.ok) throw new Error("Impossible d'enregistrer l'échéance.");
}

export async function deleteDeadline(documentId: string): Promise<void> {
  const res = await apiFetch(`/api/documents/${documentId}/deadline`, { method: "DELETE" });
  if (!res.ok) throw new Error("Impossible de supprimer l'échéance.");
}
