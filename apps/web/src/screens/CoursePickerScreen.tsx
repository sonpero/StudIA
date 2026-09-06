import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Confused } from "../components/mascot/Confused.js";
import { Idle } from "../components/mascot/Idle.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { listDocuments } from "../lib/documents-api.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";

// docs/UI.md's Navigation note: Notions, Lecteur and Tuteur are each
// reachable directly from the nav with no course chosen, "landing on a
// picker that reuses Mes cours' own list and its four states... the
// identical component, only the destination each row routes to differs —
// one picker, reused by name, not three near-identical ones." This is that
// component: heading/description/copy/CTA are the only things that vary
// per destination, extracted from what was previously TutorScreen's own
// private TutorPickerScreen.
export function CoursePickerScreen({
  heading,
  description,
  emptyMessage,
  ctaLabel,
  ctaIcon: Icon,
  onSelectDocument,
}: {
  heading: string;
  description: string;
  emptyMessage: string;
  ctaLabel: string;
  ctaIcon: LucideIcon;
  onSelectDocument: (documentId: string) => void;
}) {
  const query = useQuery({ queryKey: ["documents"], queryFn: listDocuments });

  if (query.status === "pending") {
    return (
      <main className="p-8">
        <h1 className="mb-[var(--space-section)] font-[family-name:var(--font-display)] text-2xl font-extrabold">{heading}</h1>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[var(--radius-card)] bg-border" />
          ))}
        </div>
      </main>
    );
  }

  if (query.status === "error") {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Confused />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">{heading}</h1>
        <p>Impossible de charger tes cours. Vérifie ta connexion et réessaie.</p>
        <Button onClick={() => void query.refetch()}>Réessayer</Button>
      </main>
    );
  }

  const documents = query.data;

  if (documents.length === 0) {
    return (
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <Idle />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">{heading}</h1>
        <p>{emptyMessage}</p>
      </main>
    );
  }

  return (
    <main className="p-8">
      <h1 className="mb-[var(--space-section)] font-[family-name:var(--font-display)] text-2xl font-extrabold">{heading}</h1>
      <p className="mb-[var(--space-block)] text-sm text-text-muted">{description}</p>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-[var(--space-block)]">
        {documents.map((document) => (
          <Card key={document.id} className="flex items-center justify-between gap-3" data-testid="course-picker-row">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ backgroundColor: document.colour }} />
              <span className="font-[family-name:var(--font-display)] text-[length:var(--text-title)] font-extrabold">{document.title}</span>
            </div>
            <Button variant="secondary" onClick={() => onSelectDocument(document.id)}>
              <Icon aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
              {ctaLabel}
            </Button>
          </Card>
        ))}
      </div>
    </main>
  );
}
