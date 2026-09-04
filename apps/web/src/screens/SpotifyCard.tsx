import { useState } from "react";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";

// One fixed playlist, no per-user preference (docs/UI.md's Aujourd'hui —
// Spotify note): hardcoded, not resolved via a live oEmbed call, since
// oEmbed exists to resolve a URL that varies per request and this one
// never does.
const PLAYLIST_EMBED_URL = "https://open.spotify.com/embed/playlist/37i9dQZF1DX3PFzdbtx1Us";

export function SpotifyCard() {
  const [revealed, setRevealed] = useState(false);

  return (
    <Card className="flex flex-col gap-3" data-testid="spotify-card">
      <h2 className="text-[length:var(--text-label)] font-medium text-text-muted">Musique</h2>

      {!revealed && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-muted">Écoute de la musique pendant que tu travailles.</p>
          {/* No <iframe> exists anywhere in the tree until this is clicked
              (docs/UI.md's Aujourd'hui — Spotify note): that is what
              actually guarantees zero request and zero third-party cookie
              before the click, not merely an unset src attribute. */}
          <Button type="button" variant="secondary" onClick={() => setRevealed(true)} className="self-start">
            Écouter
          </Button>
        </div>
      )}

      {revealed && (
        <div className="flex flex-col gap-3">
          <iframe
            src={PLAYLIST_EMBED_URL}
            title="Lecteur Spotify"
            width="100%"
            height="152"
            style={{ borderRadius: "var(--radius-card)" }}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
          <Button type="button" variant="secondary" onClick={() => setRevealed(false)} className="self-start">
            Fermer
          </Button>
        </div>
      )}
    </Card>
  );
}
