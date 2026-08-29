import { apiFetch } from "./api-client.js";

export type TodoProposal = {
  id: string;
  jobId: string;
  label: string;
  dueDate: string | null;
  subjectHint: string | null;
  createdAt: string;
};

export type ProposalsView = {
  status: "pending" | "running" | "done" | "failed";
  lastError: string | null;
  proposals: TodoProposal[];
};

export async function uploadTodoPhoto(file: File): Promise<{ jobId: string }> {
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await apiFetch("/api/todos/from-photo", { method: "POST", body: form });
  if (!res.ok) throw new Error("Impossible d'envoyer la photo.");
  return res.json() as Promise<{ jobId: string }>;
}

export async function getProposals(jobId: string): Promise<ProposalsView> {
  const res = await apiFetch(`/api/todos/proposals/${jobId}`);
  if (!res.ok) throw new Error("Impossible de charger les propositions.");
  return res.json() as Promise<ProposalsView>;
}

export async function confirmProposals(jobId: string, accepted: string[]): Promise<void> {
  const res = await apiFetch(`/api/todos/proposals/${jobId}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accepted }) });
  if (!res.ok) throw new Error("Impossible de confirmer les propositions.");
}

export async function rejectProposals(jobId: string): Promise<void> {
  const res = await apiFetch(`/api/todos/proposals/${jobId}/reject`, { method: "POST" });
  if (!res.ok) throw new Error("Impossible de rejeter les propositions.");
}
