import { Plus, Upload, UploadCloud } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "./ui/button.js";
import { Card } from "./ui/card.js";
import { FIELD_CLASS } from "./ui/field-styles.js";
import { createDocument, deleteDocument, startExtraction, uploadPage } from "../lib/documents-api.js";
import { guessSourceType } from "../lib/detect-source-type.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";
import { cn } from "../lib/utils.js";

interface StagedFile {
  id: string;
  file: File;
}

const UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  unsupported: "Ce type de fichier n'est pas pris en charge.",
  "too-large": "Ce fichier dépasse 20 Mo.",
  duplicate: "Cette photo a déjà été ajoutée à ce cours.",
  unknown: "L'envoi a échoué.",
};

// Redesigned per the "Mes cours" mockup, ignoring docs/UI.md per the user —
// always open (no "+ Ajouter un cours" toggle to click through first,
// unlike the version this replaces) with a real drop zone: dragging a file
// onto it stages it exactly like picking it from the browser, not just a
// decorative box that looks like one.
export function UploadCard({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const titleId = useId();
  const fileInputId = useId();

  function addFiles(selected: FileList | null) {
    if (!selected) return;
    setFiles((prev) => [...prev, ...Array.from(selected).map((file) => ({ id: crypto.randomUUID(), file }))]);
  }

  function move(index: number, direction: -1 | 1) {
    setFiles((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      const item = next[index]!;
      next[index] = next[target]!;
      next[target] = item;
      return next;
    });
  }

  function remove(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function reset() {
    setTitle("");
    setFiles([]);
    setError(null);
  }

  async function confirm() {
    if (files.length === 0) return;
    setSubmitting(true);
    setError(null);
    let documentId: string | null = null;
    try {
      const sourceType = guessSourceType(files[0]!.file) ?? "pdf";
      const doc = await createDocument({ title: title || files[0]!.file.name, sourceType });
      documentId = doc.id;
      for (const staged of files) {
        const result = await uploadPage(doc.id, staged.file);
        if (!result.ok) throw new Error(UPLOAD_ERROR_MESSAGES[result.error]);
      }
      await startExtraction(doc.id);
      reset();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'envoi a échoué.");
      // The confirmation is refused on screen: the document created for it
      // must not survive, or it is left "en attente" forever with no job
      // ever enqueued for it (see docs/modules/ingestion.md).
      if (documentId) await deleteDocument(documentId).catch(() => undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="flex flex-col gap-[var(--space-block)]" data-testid="upload-card">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Plus aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} className="text-primary" />
        Ajouter un cours
      </div>
      <p className="text-sm text-text-muted">PDF ou photos de notes manuscrites.</p>

      <label
        htmlFor={fileInputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed bg-canvas p-6 text-center ${
          dragOver ? "border-primary bg-primary-soft" : "border-border"
        }`}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft">
          <UploadCloud aria-hidden="true" focusable="false" size={20} strokeWidth={ICON_STROKE_WIDTH} className="text-primary" />
        </span>
        <span className="text-sm font-medium">Dépose un fichier ou clique pour parcourir</span>
        <span className="text-[length:var(--text-label)] text-text-muted">PDF, Word, PowerPoint, JPG, PNG ou WEBP · jusqu'à 20 Mo</span>
        <input
          id={fileInputId}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,.pdf,.docx,.pptx"
          onChange={(e) => addFiles(e.target.files)}
          className="sr-only"
        />
      </label>

      {files.length > 0 && (
        <ul className="flex flex-col gap-2">
          {files.map((staged, index) => (
            <li key={staged.id} className="flex items-center gap-2 rounded-[var(--radius-button)] border border-border p-2 text-sm">
              {staged.file.type.startsWith("image/") ? (
                <img src={URL.createObjectURL(staged.file)} alt="" className="h-10 w-10 rounded object-cover" />
              ) : (
                <span aria-hidden="true">📄</span>
              )}
              <span className="flex-1 truncate">{staged.file.name}</span>
              <button
                type="button"
                aria-label={`Monter ${staged.file.name}`}
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Descendre ${staged.file.name}`}
                onClick={() => move(index, 1)}
                disabled={index === files.length - 1}
                className="disabled:opacity-30"
              >
                ↓
              </button>
              <button type="button" aria-label={`Retirer ${staged.file.name}`} onClick={() => remove(index)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <label htmlFor={titleId} className="flex flex-col gap-1 text-sm font-medium">
        Titre du cours
        <input
          id={titleId}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={cn(FIELD_CLASS, "rounded-2xl")}
          placeholder="Chapitre 3 — La photosynthèse"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-text">
          {error}
        </p>
      )}

      <p className="text-[length:var(--text-label)] text-text-muted">On extrait le texte et on le découpe en notions automatiquement.</p>

      <Button variant="accent" onClick={() => void confirm()} disabled={submitting || files.length === 0} className="justify-center rounded-2xl">
        <Upload aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
        {submitting ? "Envoi en cours…" : "Créer le cours"}
      </Button>
    </Card>
  );
}
