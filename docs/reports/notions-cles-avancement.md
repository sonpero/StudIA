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

- Étape 6 : interface Notions (déclenchement unique, cases retirées), e2e
  `course-cards.spec.ts`, specs existants adaptés (D15). 58/58 e2e.
- Étape 7 : eval écrite, essai à blanc validé, `078bfc9`. Passage payant
  **bloqué** : crédit API épuisé (D14), 0 $ dépensé.

- Étape 8 : rapport final (`notions-cles-rapport.md`).

## Mission de finalisation (suite du 2026-10-03)

### Fait

- Étape 1, données personnelles : adresse gmail absente partout. Les
  commits de la branche ont été réécrits avec l'adresse noreply GitHub
  (D16), `d250e14`.
- Étape 2, eval réelle :
  - a2a-5p : dans les bornes (16 / 7 / 2) après 2 itérations (D17) ;
  - a2a-25p : dans les bornes (57 / 29 / 12) ;
  - cours de 67 pages : 3 échecs techniques corrigés (D18, D19).
- Étape 3, ajustements : prompts, invariant de longueur des QCM, relance
  sous le minimum, regroupement pour les cours longs, abandon des QCM et
  questions libres invalides, réparation des sorties JSON.
- Étape 4 : ancien flux supprimé (D20), `becae42`.
- Étape 5 : débordement des options de QCM corrigé (`Button multiline`),
  e2e en 1280 px et en 375 px, `f8e3fb3`. Suite e2e : 60/60.

### En cours

- Passage du cours de 67 pages sur le code final.
- Puis relance d'a2a-25p sur le code final, si le budget le permet.

### Ensuite

- Relecture de 10 cartes du cours de 67 pages.
- Rapport final, MILESTONES, poussée de la branche.
