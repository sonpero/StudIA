import { Upload } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "./ui/button.js";
import { Card } from "./ui/card.js";
import { createDocument, deleteDocument, startExtraction, uploadPage } from "../lib/documents-api.js";
import { guessSourceType } from "../lib/detect-source-type.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";

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

export function UploadCard({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setOpen(false);
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

  if (!open) {
    return (
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen(true);
        }}
        className="flex min-h-40 cursor-pointer items-center justify-center border-dashed text-text-muted hover:border-primary hover:text-primary"
      >
        + Ajouter un cours
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <label htmlFor={titleId} className="mb-1 block text-sm font-medium">
          Titre du cours
        </label>
        <input
          id={titleId}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-[var(--radius-button)] border border-border px-3 py-2 text-sm"
          placeholder="Chapitre 3 — La photosynthèse"
        />
      </div>

      <div>
        <label htmlFor={fileInputId} className="mb-1 block text-sm font-medium">
          Photos ou document
        </label>
        <input
          id={fileInputId}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,.pdf,.docx,.pptx"
          onChange={(e) => addFiles(e.target.files)}
          className="text-sm"
        />
      </div>

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

      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="accent" onClick={() => void confirm()} disabled={submitting || files.length === 0}>
          <Upload aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
          {submitting ? "Envoi en cours…" : "Confirmer"}
        </Button>
        <Button variant="secondary" onClick={reset} disabled={submitting}>
          Annuler
        </Button>
      </div>
    </Card>
  );
}
