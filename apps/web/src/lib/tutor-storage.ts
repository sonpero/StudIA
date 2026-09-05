// The client's own record of "which conversation is active for this
// document" (docs/UI.md's Tuteur note): tutor.md's API has no per-document
// conversation-list route, so this is the only place that fact lives on the
// client. A per-viewer convenience, not a source of truth -- wrapped in
// try/catch because a private window or blocked storage must never break
// the screen, just start a fresh conversation next time.
const KEY_PREFIX = "studia:tutor:conversation:";

export function getCachedConversationId(documentId: string): string | null {
  try {
    return localStorage.getItem(`${KEY_PREFIX}${documentId}`);
  } catch {
    return null;
  }
}

export function setCachedConversationId(documentId: string, conversationId: string): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${documentId}`, conversationId);
  } catch {
    // Lost silently: the next visit just starts a new conversation.
  }
}
