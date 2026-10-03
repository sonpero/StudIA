# Conception — notions clés et budget de cartes (M11)

Plan court, écrit avant le code. Les choix non spécifiés sont justifiés dans
`notions-cles-decisions.md`.

## Flux

1. Notions → « Créer les fiches » (un seul bouton, tous types).
2. `POST /api/documents/:id/cards/generate` enfile un job
   `generate-course-cards` `{ documentId }`. Réponses :
   - 202 si le job est enfilé ;
   - 403 si le cours est inconnu ou n'a pas de notions ;
   - 409 `has-cards` si le cours a déjà des cartes ;
   - 409 `in-progress` si un job de ce cours est en attente ou en cours.
3. Le handler `handleCourseGenerationJob` (module `generation`) :
   1. Sort sans rien faire si le cours a déjà des cartes : déjà terminé
      (idempotence) ou cours existant (jamais régénéré).
   2. Lit l'extraction complète (`ingestion`) et les notions de lecture
      (`content`).
   3. Notions clés : réutilise celles déjà enregistrées pour ce cours, sinon
      fait **un appel** `KeyNotionExtractor.extract`. Cet appel reçoit le
      texte, les notions de lecture (`L1…Ln` et titres) et les fourchettes
      du budget. Ensuite, en code : validation, dédoublonnage, plafond,
      couverture des sections. Puis une courte transaction d'écriture.
   4. Cibles par type, en fonction pure : une flashcard par notion clé, un
      QCM par essentielle, une question libre par notion de synthèse, chaque
      type sous son plafond.
   5. Génération **par lots** : un appel par type et par lot. Chaque lot
      reçoit les notions clés (`K1…`) et le corps des notions de lecture
      qu'elles couvrent. Les cartes invalides ou manquantes sont redemandées
      une fois, avec l'erreur. Ensuite : plafonds durs, une carte par notion
      clé et par type, mélange des options de QCM.
   6. Une seule transaction écrit les cartes et leurs liens aux notions clés.
4. `GET /api/documents/:id/generation-status` intègre le job de cours
   (`total = 1`). L'écran interroge ce statut tant que le job tourne.

Aucun appel au modèle ne se fait dans une transaction. Les échecs
définitifs passent par `recordTerminalFailures`, comme pour le découpage :
cours trop long pour un appel, ou cours qui a déjà des cartes.

## Schéma (migration additive, `cards` inchangée)

```sql
CREATE TABLE key_notions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  importance TEXT NOT NULL CHECK (importance IN ('essential','important')),
  is_synthesis INTEGER NOT NULL CHECK (is_synthesis IN (0,1)),
  section TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (document_id, position)
);
CREATE TABLE key_notion_sources (       -- notions de lecture couvertes
  key_notion_id TEXT NOT NULL REFERENCES key_notions(id) ON DELETE CASCADE,
  notion_id TEXT NOT NULL REFERENCES notions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (key_notion_id, notion_id)
);
CREATE TABLE key_notion_cards (         -- carte → notion clé
  card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  key_notion_id TEXT NOT NULL REFERENCES key_notions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id)
);
```

- `cards.notion_id` reçoit la première notion de lecture couverte, dans
  l'ordre du cours. Le Lecteur, la révision, la progression et le
  marquage « périmée » continuent donc de fonctionner sans changement.
  Les autres sources se lisent via `key_notion_sources`.
- **Retour arrière** : `DROP TABLE key_notion_cards; DROP TABLE
  key_notion_sources; DROP TABLE key_notions;`. Aucune colonne ni ligne
  existante n'est touchée. Les cartes créées par le nouveau flux restent
  valides sans leurs liens.

## Budget (fonction pure, constante unique)

`CARD_BUDGET` dans `generation/domain/card-budget.ts`. Une page vaut
1 500 caractères. Les points d'ancrage donnent des fourchettes de notions
clés, de QCM (essentielles) et de questions libres (synthèse) :

| Pages | Notions clés = flashcards | QCM | Questions libres |
|---|---|---|---|
| ≤ 1 | 5–10 | 2–4 | 1–2 |
| 5 | 15–25 | 6–10 | 2–4 |
| 25 | 40–60 | 20–30 | 8–12 |
| ≥ 60 | 70–90 | 35–45 | 12–15 |

Entre deux points, l'interpolation est linéaire. Au-delà de 60 pages, la
fourchette ne bouge plus, soit 150 cartes au plus (90 + 45 + 15). Le
plafond total de 150 est aussi vérifié en code.

## Interface

- Notions : les cases à cocher par type disparaissent.
- Le bouton « Créer les fiches » n'apparaît que si le cours n'a aucune
  carte. Pendant le job, l'écran affiche « Création des fiches en cours… ».
  En cas d'échec, il affiche un message et le bouton redevient disponible.
- Aucun bouton « Régénérer ».

## Retrait de l'ancien flux

- L'interface n'appelle plus `POST /api/documents/:id/generate`.
- Les routes de l'ancien flux et le handler `generate-cards` restent, sans
  appelant côté interface. Le handler sert aussi à terminer les jobs encore
  en file au moment du déploiement. Les supprimer obligerait à supprimer
  leurs tests, ce que CLAUDE.md interdit sans accord (voir le journal).
