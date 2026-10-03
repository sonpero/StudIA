# Journal de décisions — notions clés et budget de cartes

Mission autonome du 2026-10-03, branche `feat/key-notions-card-budget`.
Chaque entrée : le choix, les alternatives écartées, la raison.
Les entrées marquées **[à relire]** méritent une relecture prioritaire.

## D1. Correctif diffCards : filtrer dans le handler, pas dans `diffCards`

- **Choix** : `handleGenerationJob` ne passe à `diffCards` que les cartes
  existantes des types en cours de génération. `diffCards` reste inchangé.
- **Écarté** : ajouter un paramètre `types` à `diffCards`. Le test existant
  « matches by (type, question) independently » attend qu'un flashcard
  absent du jeu généré soit supprimé quand on lui passe ce jeu. Avec un
  filtre interne, ce test deviendrait faux, et CLAUDE.md interdit de
  modifier un test existant.
- **Raison** : `diffCards` compare deux ensembles qu'on lui donne, ce qui
  reste juste. L'erreur était dans le choix de l'ensemble par le handler.
- **Tests** : deux tests unitaires et un test d'intégration avec une vraie
  base (carte, planning et révision conservés), tous trois observés rouges
  avant le correctif.
