// A course refused on screen (docs/modules/ingestion.md, UploadCard.tsx)
// rolls its document back client-side, but that DELETE is best-effort: a
// closed tab or a dropped connection at exactly the wrong moment leaves the
// document behind with no extract-document job ever enqueued for it. 30
// minutes gives a slow multi-photo upload, or a tab left open mid-upload,
// room to legitimately finish before an unsupervised sweep considers a
// document abandoned — much more tolerant than the 5-minute window used for
// a one-off manual inspection, where a human judges the context.
export const ABANDONED_DOCUMENT_THRESHOLD_MS = 30 * 60 * 1000;

export function isAbandonedDocument(createdAt: string, hasExtractionJob: boolean, now: Date): boolean {
  if (hasExtractionJob) return false;
  return now.getTime() - new Date(createdAt).getTime() >= ABANDONED_DOCUMENT_THRESHOLD_MS;
}
