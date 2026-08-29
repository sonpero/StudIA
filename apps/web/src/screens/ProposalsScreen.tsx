import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Confused } from "../components/mascot/Confused.js";
import { Idle } from "../components/mascot/Idle.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { confirmProposals, getProposals, rejectProposals, type TodoProposal } from "../lib/proposals-api.js";

// This screen is where the milestone's central invariant becomes visible:
// the person sees proposals, accepts some, and nothing else reaches their
// todos (docs/modules/workspace.md). subject is shown as a hint only — no
// dropdown, no automatic course link (this module's own Open question).
function ProposalRow({ proposal, checked, onToggle }: { proposal: TodoProposal; checked: boolean; onToggle: () => void }) {
  return (
    <li className="flex items-start gap-3">
      <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1" aria-label={proposal.label} />
      <div className="flex flex-col">
        <span>{proposal.label}</span>
        <span className="text-sm text-text-muted">
          {proposal.subjectHint ? `${proposal.subjectHint} — ` : ""}
          {proposal.dueDate ? `pour le ${proposal.dueDate}` : "sans échéance indiquée"}
        </span>
      </div>
    </li>
  );
}

export function ProposalsScreen({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  // Checked by default: tracking exceptions (unchecked ids) rather than
  // the checked set itself means "default all checked" needs no seeding
  // from the fetched data — nothing to derive during render, no effect to
  // sync it, and a freshly arrived proposal is checked without any extra
  // bookkeeping.
  const [uncheckedIds, setUncheckedIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);

  const query = useQuery({
    queryKey: ["proposals", jobId],
    queryFn: () => getProposals(jobId),
    refetchInterval: (q) => (q.state.data?.status === "pending" || q.state.data?.status === "running" ? 1500 : false),
  });

  async function handleReject() {
    setPending(true);
    try {
      await rejectProposals(jobId);
      onBack();
    } finally {
      setPending(false);
    }
  }

  async function handleConfirm(proposals: TodoProposal[]) {
    setPending(true);
    try {
      await confirmProposals(
        jobId,
        proposals.filter((p) => !uncheckedIds.has(p.id)).map((p) => p.id),
      );
      onBack();
    } finally {
      setPending(false);
    }
  }

  function toggle(id: string) {
    setUncheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (query.status === "pending") {
    return (
      <main className="flex flex-col gap-4 p-8">
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Propositions</h1>
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[var(--radius-card)] bg-border" />
          ))}
        </div>
      </main>
    );
  }

  if (query.status === "error") {
    return (
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <Confused />
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Propositions</h1>
        <p>Impossible de charger les propositions. Vérifie ta connexion et réessaie.</p>
        <Button onClick={() => void query.refetch()}>Réessayer</Button>
      </main>
    );
  }

  const view = query.data;

  if (view.status === "pending" || view.status === "running") {
    return (
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Propositions</h1>
        <p>Extraction en cours…</p>
      </main>
    );
  }

  if (view.status === "failed") {
    return (
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <Confused />
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Propositions</h1>
        <p>{view.lastError ?? "L'extraction a échoué."}</p>
        <Button variant="secondary" disabled={pending} onClick={() => void handleReject()}>
          Fermer
        </Button>
      </main>
    );
  }

  if (view.proposals.length === 0) {
    return (
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <Idle />
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Propositions</h1>
        <p>Aucun devoir trouvé sur cette photo.</p>
        <Button variant="secondary" disabled={pending} onClick={() => void handleReject()}>
          Fermer
        </Button>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Propositions</h1>
      <Card>
        <ul className="flex flex-col gap-4">
          {view.proposals.map((proposal) => (
            <ProposalRow key={proposal.id} proposal={proposal} checked={!uncheckedIds.has(proposal.id)} onToggle={() => toggle(proposal.id)} />
          ))}
        </ul>
      </Card>
      <div className="flex gap-3">
        <Button disabled={pending} onClick={() => void handleConfirm(view.proposals)}>
          Confirmer la sélection
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => void handleReject()}>
          Tout rejeter
        </Button>
      </div>
    </main>
  );
}
