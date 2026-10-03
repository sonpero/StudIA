# Avancement — notions clés et budget de cartes

Branche `feat/key-notions-card-budget`. À relire en premier après une
compaction du contexte.

## Fait

- Étape 0 : branche créée.
- Étape 1 : correctif diffCards (D1 du journal), `6b5d847`.
- Étape 2 : milestone M11 et conception, `0bc504a`.
- Étape 3 : tables `key_notions`, `key_notion_sources`, `key_notion_cards`
  (migration 0013, additive), `SqliteKeyNotionRepository`. Test de rejeu
  depuis 0012, vérifié par mutation (`DELETE FROM reviews` injecté → rouge).

- Étape 4 : `cardBudget` (constante `CARD_BUDGET`), fonctions de plan
  (`dedupeKeyNotions`, `capKeyNotions`, `cardTargets`, `capGeneratedCards`),
  règles QCM `optionsArePositionIndependent` et `shuffleOptions`. Mutations :
  9 mutations ciblées, toutes tuées (une ne l'était pas, cas de test ajouté).

- Étape 5 : ports `KeyNotionExtractor` et `KeyNotionCardGenerator`,
  adaptateurs fixture et Claude (tests de contrat MSW), job
  `generate-course-cards`, `requestCourseCards`, route
  `POST /api/documents/:id/cards/generate`, statut, worker.

## En cours

- Étape 6 (sous-agent) : interface Notions et e2e.
- Étape 7 : evals.

## Ensuite

8. Rapport final.

## Dépense

0 $ sur 10 $.
