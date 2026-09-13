import type { DocumentSummary, ExtractionStatus } from "@studia/contracts";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Layers, MessageCircle } from "lucide-react";
import { useRef, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import { Confused } from "../components/mascot/Confused.js";
import { Idle } from "../components/mascot/Idle.js";
import { Reading } from "../components/mascot/Reading.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { getDocument, listDocuments } from "../lib/documents-api.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";

function isActive(status: ExtractionStatus): boolean {
  return status === "pending" || status === "running";
}

// This app's own token classes, not @tailwindcss/typography (docs/UI.md's
// Lecteur note): that plugin brings its own spacing/colour scale to
// reconcile against tokens.css, for a job every other screen here already
// does by hand.
//
// Heading levels are shifted down by two (source h1 -> DOM h3, and so on):
// the reading card already has its own h2 (the course title, now visually
// hidden — see below), so the document's own heading hierarchy nests under
// that rather than competing with it. Content's own size scale
// (text-lg/text-base/text-sm, 18/16/14px) is deliberately NOT the same
// visual size per level as the chrome around it: it must sit strictly
// under --text-title (20px), the smallest heading the chrome itself ever
// shows, so a fact stated inside the document can never read at the same
// size as the course's own title (docs/UI.md's Lecteur note).
//
// A typography pass (still this screen, still M10 Phase 1's "more polish
// on an already-redesigned screen" permission) found the reading body's
// own <p> carried no font-size class at all — 16px by the browser's own
// default, not this file's or the chrome's decision, and nothing protected
// it from an ancestor ever setting something smaller. text-base below
// makes that 16px explicit. With a 16px body and content's own ceiling
// unchanged at text-lg (18px, one step under --text-title's 20px), there is
// exactly one size step left above body — h1 keeps it. h2 necessarily lands
// at body's own 16px: weight and typeface alone were not enough to carry
// that pair on their own, so the space above it (mt-6, clearly greater than
// the mt-2 the very next block gets — see the container's own [&>h4+*]
// override below) is the actual differentiator now, not a size this scale
// no longer has to give it. h3 stays at 14px, *smaller* than the body it
// introduces — read uncritically, a smaller heading than its own body
// reads as a demoted caption, not a heading. Recast instead as a deliberate
// "kicker"/eyebrow label — uppercase, wide tracking, --text-muted's own
// "secondary text, labels, metadata" role — a named, argued typographic
// register on its own, not a smaller, weaker h2. docs/UI.md's Lecteur note
// has the full reasoning for choosing this over simply raising h3 to body
// size (which would leave three same-size elements needing pairwise
// differentiation instead of two).
const READER_COMPONENTS: Components = {
  h1: (props) => <h3 className="mt-8 font-[family-name:var(--font-display)] text-lg font-extrabold text-text first:mt-0" {...props} />,
  h2: (props) => <h4 className="mt-6 font-[family-name:var(--font-display)] text-base font-extrabold text-text first:mt-0" {...props} />,
  h3: (props) => <h5 className="mt-4 text-sm font-semibold uppercase tracking-wide text-text-muted first:mt-0" {...props} />,
  p: (props) => <p className="mt-4 text-base leading-relaxed text-text first:mt-0" {...props} />,
  ul: (props) => <ul className="mt-4 list-disc pl-6 text-base text-text" {...props} />,
  ol: (props) => <ol className="mt-4 list-decimal pl-6 text-base text-text" {...props} />,
  li: (props) => <li className="mt-1" {...props} />,
  strong: (props) => <strong className="font-semibold text-text" {...props} />,
  blockquote: (props) => <blockquote className="mt-4 border-l-2 border-border pl-4 text-base text-text-muted" {...props} />,
  code: (props) => <code className="rounded bg-canvas px-1 py-0.5 text-sm" {...props} />,
};

// Same idiom as NotionsScreen's own CoursePill (docs/UI.md's Notions note),
// kept local rather than shared — small enough that importing it across
// screens would cost more than it saves.
function CoursePill({ document, active, onSelect }: { document: DocumentSummary; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
      className={`flex min-h-11 items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors md:min-h-0 ${
        active ? "border-transparent bg-primary text-white" : "border-border bg-surface text-text hover:bg-canvas"
      }`}
    >
      <BookOpen aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} color={active ? "#fff" : document.colour} />
      {document.title}
    </button>
  );
}

// Deliberately destination-agnostic (docs/UI.md's Lecteur note, same idiom
// as ProgressScreen's own plain "Retour"): this screen is reachable from
// Mes cours or from Notions du cours, and onBack (App.tsx) returns to
// whichever one it was — a label naming one destination would lie for the
// other path.
function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button type="button" variant="link" className="self-start" onClick={onBack}>
      Retour
    </Button>
  );
}

// The panel offering to turn what was just read into recall practice —
// "renvoi vers les notions ou le tuteur" from the mockup. Only shown
// alongside actual rendered content (the ready state): there is nothing to
// study yet in any other state. Buttons use the same rounded-2xl pill shape
// every other M9 screen's own primary/secondary actions already use
// (NotionsScreen's own "Réviser"/"Créer les fiches"), and reuse the exact
// icons the nav already assigns to each destination (Layers for Notions,
// MessageCircle for Tuteur, docs/UI.md's Icons note) rather than inventing
// new ones for the same place.
function StudyPanel({ onOpenNotions, onOpenTutor }: { onOpenNotions: () => void; onOpenTutor: () => void }) {
  return (
    <Card className="flex h-fit w-full shrink-0 flex-col gap-[var(--space-related)] lg:w-72" data-testid="reader-study-panel">
      <div>
        {/* Deliberately lighter than a real heading (docs/UI.md's Lecteur
            note): the body font at font-semibold, not --font-display's
            extrabold every other card title in this app uses — this panel
            is a secondary aside beside the reading card, not a competing
            section of its own. */}
        <h3 className="text-sm font-semibold text-text">Étudier ce cours</h3>
        <p className="text-sm text-text-muted">Exercice de mémorisation.</p>
      </div>
      <Button variant="accent" className="rounded-2xl" onClick={onOpenNotions}>
        <Layers aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
        Réviser les notions
      </Button>
      {/* Same secondary-with-tint idiom as Mes cours' own "Lire le cours"
          button (DocumentsScreen.tsx) — a light green wash, not the plain
          bordered secondary every other non-accent button here uses. */}
      <Button variant="secondary" className="rounded-2xl border-transparent bg-primary-soft text-primary hover:bg-primary-soft" onClick={onOpenTutor}>
        <MessageCircle aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
        Discuter avec le tuteur
      </Button>
    </Card>
  );
}

// One course's own reading content — kept as its own component (not inlined
// into ReaderScreen below) so switching the pill selection can key-remount
// it, resetting per-course polling state instead of leaking it from the
// previously-selected course (same reasoning as NotionsScreen's own
// NotionsCourseScreen split).
function ReaderCourseContent({
  documentId,
  onOpenNotions,
  onOpenTutor,
}: {
  documentId: string;
  onOpenNotions: () => void;
  onOpenTutor: () => void;
}) {
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
      <div className="flex w-full max-w-2xl flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-4 animate-pulse rounded-[var(--radius-button)] bg-border" />
        ))}
      </div>
    );
  }

  if (query.status === "error") {
    return (
      <div className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Confused />
        <p>Impossible de charger ce cours. Vérifie ta connexion et réessaie.</p>
        <Button className="rounded-2xl" onClick={() => void query.refetch()}>
          Réessayer
        </Button>
      </div>
    );
  }

  const document = query.data;

  // Reachable by more than a single gated entry point (a stale render, a
  // future entry point) — every extraction status this screen could see is
  // defined here, not left to chance (docs/UI.md's Lecteur note).
  if (isActive(document.status)) {
    return (
      <div className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Reading />
        <p>Ce cours est encore en cours de lecture. Reviens dans un instant.</p>
      </div>
    );
  }

  if (document.status === "failed") {
    return (
      <div className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Confused />
        <p>La lecture de ce cours a échoué. Mets-la à jour depuis Mes cours.</p>
      </div>
    );
  }

  const markdown = document.markdown?.trim() ?? "";

  if (markdown === "") {
    return (
      <div className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Idle />
        <p>Ce cours ne contient pas encore de texte lisible.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-[var(--space-section)] lg:flex-row">
      {/* No card frame (border/radius/shadow all cancelled): a reading
          surface doesn't need to look like a bordered card, only bg-surface
          stays so the text isn't sitting directly on --canvas
          (docs/UI.md's Lecteur note). max-w is text-relative, not a fixed
          pixel cap: max-w-2xl gave 85-90 characters per line at this
          file's own 16px body, well past the 60-75 comfortable measure.
          56, not the rounder 65, because ch is calibrated to the current
          font's own "0" glyph, not the average width of real prose: at
          this file's own 16px body/Inter, 65ch measured live at ~79 real
          characters per line, already past the comfortable range, and
          56ch is what actually lands the real, measured average in the
          65-70 target — do not "round" this back to 65, that reintroduces
          the defect this value fixes. text-base here is what makes ch
          resolve against the actual 16px body size, not an inherited
          ambient size from further up the tree. The [&>h_+*] overrides
          target whatever block immediately follows a heading
          (react-markdown renders with no wrapper of its own — confirmed
          live — so h3/h4/h5 land as direct children here, the same level
          the now-hidden title sits at), tightening the space below a
          heading well under the space above it: the headings' own
          mt-8/mt-6/mt-4 rhythm is unchanged, this only shortens what
          comes after. */}
      <Card className="w-full max-w-[56ch] border-0 rounded-none text-base shadow-none [&>h3+*]:mt-2 [&>h4+*]:mt-2 [&>h5+*]:mt-2">
        {/* The course title repeats the pill already selected just above
            this card — a visual duplication, removed (along with the
            colour dot that duplicated the same pill's own icon colour).
            Not deleted: sr-only keeps it in the accessibility tree,
            carrying this document's own heading structure, findable by
            role and name exactly as before. */}
        <h2 className="sr-only font-[family-name:var(--font-display)] text-[length:var(--text-title)] font-extrabold">{document.title}</h2>
        <Markdown components={READER_COMPONENTS}>{document.markdown}</Markdown>
      </Card>
      <StudyPanel onOpenNotions={onOpenNotions} onOpenTutor={onOpenTutor} />
    </div>
  );
}

// Redesigned per a "Lecteur" mockup, ignoring docs/UI.md per the user: one
// unified page (a course-picker row of pills, then that course's own
// reading surface), the same unification NotionsScreen's own redesign
// already went through, not a separate picker page you leave to reach a
// course's content. documentId (still optional, from App.tsx's own View)
// keeps every existing deep link working (Mes cours' "Lire le cours",
// Notions du cours' own toolbar) — when set, that course is pre-selected
// and "Retour" appears; when absent (the nav's own direct entry), no back
// link at all, matching Notions' own top-level entry, and the first course
// is selected by default. Switching pills is a local selection, not a view
// transition — there is no separate picker view left to transition into.
export function ReaderScreen({
  documentId,
  onBack,
  onOpenNotions,
  onOpenTutor,
}: {
  documentId?: string;
  onBack: () => void;
  onOpenNotions: (documentId: string) => void;
  onOpenTutor: (documentId: string) => void;
}) {
  const documentsQuery = useQuery({ queryKey: ["documents"], queryFn: listDocuments });
  const [manualSelection, setManualSelection] = useState<string | undefined>(undefined);

  if (documentsQuery.status === "pending") {
    return (
      <main className="p-4 md:p-8">
        <h1 className="mb-[var(--space-section)] font-[family-name:var(--font-display)] text-2xl font-extrabold">Lecteur</h1>
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[var(--radius-card)] bg-border" />
          ))}
        </div>
      </main>
    );
  }

  if (documentsQuery.status === "error") {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] p-4 md:p-8 text-center">
        <Confused />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Lecteur</h1>
        <p>Impossible de charger tes cours. Vérifie ta connexion et réessaie.</p>
        <Button className="rounded-2xl" onClick={() => void documentsQuery.refetch()}>
          Réessayer
        </Button>
      </main>
    );
  }

  const documents = documentsQuery.data;

  if (documents.length === 0) {
    return (
      <main className="flex flex-col items-center gap-4 p-4 md:p-8 text-center">
        <Idle />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Lecteur</h1>
        <p>Ajoute un cours dans Mes cours pour le lire.</p>
      </main>
    );
  }

  const selectedId = documentId ?? manualSelection ?? documents[0]!.id;
  const selectedDocument = documents.find((d) => d.id === selectedId) ?? documents[0]!;

  return (
    <main className="p-4 md:p-8">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Lecteur</h1>
      <p className="mb-[var(--space-section)] text-sm text-text-muted">Le contenu de ton cours, mis en forme pour une lecture confortable.</p>

      <div className="mb-[var(--space-section)] flex flex-wrap gap-2">
        {documents.map((document) => (
          <CoursePill key={document.id} document={document} active={document.id === selectedDocument.id} onSelect={() => setManualSelection(document.id)} />
        ))}
      </div>

      {documentId !== undefined && (
        <div className="mb-[var(--space-related)]">
          <BackButton onBack={onBack} />
        </div>
      )}

      <ReaderCourseContent
        key={selectedDocument.id}
        documentId={selectedDocument.id}
        onOpenNotions={() => onOpenNotions(selectedDocument.id)}
        onOpenTutor={() => onOpenTutor(selectedDocument.id)}
      />
    </main>
  );
}
