import type { ExtractionStatus } from "@studia/contracts";
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import Markdown, { type Components } from "react-markdown";
import { Confused } from "../components/mascot/Confused.js";
import { Idle } from "../components/mascot/Idle.js";
import { Reading } from "../components/mascot/Reading.js";
import { Button } from "../components/ui/button.js";
import { getDocument } from "../lib/documents-api.js";

function isActive(status: ExtractionStatus): boolean {
  return status === "pending" || status === "running";
}

// This app's own token classes, not @tailwindcss/typography (docs/UI.md's
// Lecteur note): that plugin brings its own spacing/colour scale to
// reconcile against tokens.css, for a job every other screen here already
// does by hand.
//
// Heading levels are shifted down by two (source h1 -> DOM h3, and so on):
// the screen already has its own h1 ("Lecture") and h2 (the course title),
// so the document's own heading hierarchy nests under those rather than
// competing with them, while keeping the same visual size per level.
const READER_COMPONENTS: Components = {
  h1: (props) => <h3 className="mt-8 font-[family-name:var(--font-display)] text-2xl font-extrabold first:mt-0" {...props} />,
  h2: (props) => <h4 className="mt-6 font-[family-name:var(--font-display)] text-xl font-extrabold first:mt-0" {...props} />,
  h3: (props) => <h5 className="mt-4 font-[family-name:var(--font-display)] text-lg font-extrabold first:mt-0" {...props} />,
  p: (props) => <p className="mt-4 leading-relaxed text-text first:mt-0" {...props} />,
  ul: (props) => <ul className="mt-4 list-disc pl-6 text-text" {...props} />,
  ol: (props) => <ol className="mt-4 list-decimal pl-6 text-text" {...props} />,
  li: (props) => <li className="mt-1" {...props} />,
  strong: (props) => <strong className="font-semibold text-text" {...props} />,
  blockquote: (props) => <blockquote className="mt-4 border-l-2 border-border pl-4 text-text-muted" {...props} />,
  code: (props) => <code className="rounded bg-canvas px-1 py-0.5 text-sm" {...props} />,
};

// Deliberately destination-agnostic (docs/UI.md's Lecteur note, same idiom
// as ProgressScreen's own plain "Retour"): this screen is reachable from
// Mes cours or from Notions du cours, and onBack (App.tsx) returns to
// whichever one it was — a label naming one destination would lie for the
// other path.
function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="text-sm text-text-muted underline" onClick={onBack}>
      Retour
    </button>
  );
}

export function ReaderScreen({ documentId, onBack }: { documentId: string; onBack: () => void }) {
  const pollStartedAt = useRef<number | null>(null);

  const query = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => getDocument(documentId),
    refetchInterval: (q) => {
      const doc = q.state.data;
      const active = doc ? isActive(doc.status) : false;
      if (!active) {
        pollStartedAt.current = null;
        return false;
      }
      pollStartedAt.current ??= Date.now();
      // Same 30-second-backoff schedule as Mes cours (docs/UI.md): the
      // screen resolves itself if left open, no manual reload needed.
      return Date.now() - pollStartedAt.current > 30_000 ? 10_000 : 2_000;
    },
  });

  if (query.status === "pending") {
    return (
      <main className="flex flex-col gap-[var(--space-section)] bg-surface p-8">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Lecture</h1>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded-[var(--radius-button)] bg-border" />
          ))}
        </div>
      </main>
    );
  }

  if (query.status === "error") {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] bg-surface p-8 text-center">
        <Confused />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Lecture</h1>
        <p>Impossible de charger ce cours. Vérifie ta connexion et réessaie.</p>
        <Button onClick={() => void query.refetch()}>Réessayer</Button>
      </main>
    );
  }

  const document = query.data;

  // Reachable by more than its one gated button (a stale render, a future
  // entry point) — every extraction status this screen could see is
  // defined here, not left to chance (docs/UI.md's Lecteur note).
  if (isActive(document.status)) {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] bg-surface p-8 text-center">
        <Reading />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Lecture</h1>
        <p>Ce cours est encore en cours de lecture. Reviens dans un instant.</p>
        <BackButton onBack={onBack} />
      </main>
    );
  }

  if (document.status === "failed") {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] bg-surface p-8 text-center">
        <Confused />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Lecture</h1>
        <p>La lecture de ce cours a échoué. Mets-la à jour depuis Mes cours.</p>
        <BackButton onBack={onBack} />
      </main>
    );
  }

  const markdown = document.markdown?.trim() ?? "";

  if (markdown === "") {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] bg-surface p-8 text-center">
        <Idle />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Lecture</h1>
        <p>Ce cours ne contient pas encore de texte lisible.</p>
        <BackButton onBack={onBack} />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-[var(--space-section)] bg-surface p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Lecture</h1>
        <BackButton onBack={onBack} />
      </div>
      <div className="mx-auto w-full max-w-2xl">
        {/* --space-section (24px) below: a page-title-to-content boundary,
            not a card-internal rhythm (docs/UI.md's Lecteur note) — there
            was no gap here at all before, invisible while the title
            rendered as plain text, a real defect once it renders as actual
            bold 20px display type directly against the content's own first
            line. */}
        <div className="mb-[var(--space-section)] flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ backgroundColor: document.colour }} />
          <h2 className="font-[family-name:var(--font-display)] text-[length:var(--text-title)] font-extrabold">{document.title}</h2>
        </div>
        <Markdown components={READER_COMPONENTS}>{document.markdown}</Markdown>
      </div>
    </main>
  );
}
