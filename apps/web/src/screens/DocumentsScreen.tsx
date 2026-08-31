import type { DocumentSummary, ExtractionStatus } from "@studia/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, BookOpenText, RotateCw } from "lucide-react";
import { useRef } from "react";
import { Confused } from "../components/mascot/Confused.js";
import { Reading } from "../components/mascot/Reading.js";
import { Card } from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { UploadCard } from "../components/UploadCard.js";
import { deleteDocument, listDocuments, retryExtraction } from "../lib/documents-api.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";

const STATUS_LABEL: Record<ExtractionStatus, string> = {
  pending: "En attente",
  running: "Lecture en cours…",
  done: "Terminé",
  failed: "Échec",
};

function isActive(status: ExtractionStatus): boolean {
  return status === "pending" || status === "running";
}

function DocumentCard({
  document,
  onChanged,
  onOpenNotions,
  onOpenReader,
}: {
  document: DocumentSummary;
  onChanged: () => void;
  onOpenNotions: (documentId: string) => void;
  onOpenReader: (documentId: string) => void;
}) {
  return (
    <Card className="flex flex-col gap-2" data-testid="document-card">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ backgroundColor: document.colour }} />
        <h3 className="font-[var(--font-display)] text-[var(--text-title)] font-extrabold">{document.title}</h3>
      </div>
      <p className="text-sm text-text-muted">
        {document.pageCount} page{document.pageCount > 1 ? "s" : ""}
      </p>
      <p aria-live="polite" className="text-sm">
        {STATUS_LABEL[document.status]}
      </p>
      {document.status === "failed" && (
        <Button variant="secondary" onClick={() => void retryExtraction(document.id).then(onChanged)}>
          <RotateCw aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
          Réessayer
        </Button>
      )}
      {document.status === "done" && (
        <>
          <Button variant="secondary" onClick={() => onOpenReader(document.id)}>
            <BookOpenText aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
            Lire le cours
          </Button>
          <Button variant="secondary" onClick={() => onOpenNotions(document.id)}>
            <BookOpen aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
            Voir les notions
          </Button>
        </>
      )}
      <button
        type="button"
        className="self-start text-sm text-text-muted underline"
        onClick={() => void deleteDocument(document.id).then(onChanged)}
      >
        Supprimer
      </button>
    </Card>
  );
}

export function DocumentsScreen({
  onOpenNotions,
  onOpenReader,
}: {
  onOpenNotions: (documentId: string) => void;
  onOpenReader: (documentId: string) => void;
}) {
  const queryClient = useQueryClient();
  const pollStartedAt = useRef<number | null>(null);

  const query = useQuery({
    queryKey: ["documents"],
    queryFn: listDocuments,
    refetchInterval: (q) => {
      const documents = q.state.data;
      const active = documents?.some((d) => isActive(d.status)) ?? false;
      if (!active) {
        pollStartedAt.current = null;
        return false;
      }
      pollStartedAt.current ??= Date.now();
      // TanStack Query with refetchInterval while status is not terminal,
      // backing off after 30 seconds (docs/UI.md).
      return Date.now() - pollStartedAt.current > 30_000 ? 10_000 : 2_000;
    },
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["documents"] });

  if (query.status === "pending") {
    return (
      <main className="p-8">
        <h1 className="mb-[var(--space-section)] font-[var(--font-display)] text-2xl font-extrabold">Mes cours</h1>
        <div className="grid grid-cols-1 gap-[var(--space-block)] sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-[var(--radius-card)] bg-border" />
          ))}
        </div>
      </main>
    );
  }

  if (query.status === "error") {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Confused />
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Mes cours</h1>
        <p>Impossible de charger tes cours. Vérifie ta connexion et réessaie.</p>
        <Button onClick={() => void query.refetch()}>Réessayer</Button>
      </main>
    );
  }

  const documents = query.data;

  return (
    <main className="p-8">
      <h1 className="mb-[var(--space-section)] font-[var(--font-display)] text-2xl font-extrabold">Mes cours</h1>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <Reading />
          <p>Aucun cours pour l'instant. Prends ton cours en photo pour commencer.</p>
          <div className="w-full max-w-sm">
            <UploadCard onCreated={refresh} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[var(--space-block)] sm:grid-cols-2 lg:grid-cols-3">
          <UploadCard onCreated={refresh} />
          {documents.map((document) => (
            <DocumentCard key={document.id} document={document} onChanged={refresh} onOpenNotions={onOpenNotions} onOpenReader={onOpenReader} />
          ))}
        </div>
      )}
    </main>
  );
}
