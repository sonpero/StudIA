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

## D2. Les sections viennent du modèle, pas des titres du Markdown [à relire]

- **Choix** : l'appel d'extraction rend aussi la liste des grandes parties
  du cours (2 parties au moins, et pas plus que le minimum de notions
  clés). Chaque notion clé désigne la sienne par son index. Le code vérifie
  que chaque partie a au moins une notion clé. Sinon, il relance une fois
  avec la liste des parties manquantes, puis fait échouer le job.
- **Écarté** : déduire les sections des titres `#`/`##` de l'extraction.
  Sur A2A, l'extraction PDF donne 8 `#` et 299 `##` « promus », dont
  beaucoup sont des cellules de tableau (`## Aucune`, `## "error": {`).
  Les vraies parties (« 1. Introduction » … « 10. Avantages… ») y sont
  noyées.
- **Écarté** : utiliser les morceaux (`chunkBySize`) comme sections. Ils
  sont coupés à la taille, pas à la structure du cours.
- **Raison** : seul le modèle, qui lit tout le cours, voit sa structure. La
  vérification reste en partie circulaire, puisque le modèle déclare
  lui-même les parties. L'eval la complète donc par une vérité de terrain
  indépendante : une liste de parties écrite à la main pour chaque cours.

## D3. Notions clés dans le module `generation`, liens en tables séparées

- **Choix** : trois nouvelles tables dans `generation` :
  - `key_notions` ;
  - `key_notion_sources` (notions de lecture couvertes) ;
  - `key_notion_cards` (carte → notion clé).

  La table `cards` n'est pas modifiée. `cards.notion_id` reçoit la
  première notion de lecture couverte, dans l'ordre du cours.
- **Écarté** : une colonne `cards.key_notion_id`. Avec une clé étrangère,
  SQLite refuse `ALTER TABLE … DROP COLUMN` : le retour arrière exigerait
  de reconstruire `cards`, qui porte l'historique de révision.
- **Écarté** : placer les notions clés dans `content`. Elles n'existent
  que pour piloter la génération. `content` reste propriétaire du
  découpage, qui est inchangé.
- **Raison** : migration purement additive, retour arrière par trois
  `DROP TABLE`. Le Lecteur, la révision, la progression et le marquage
  « périmée » fonctionnent sans changement grâce à `notion_id`.
- **Nouveau port** : un `KeyNotionRepository` à part. `CardRepository`
  n'est pas élargi, car `review` et `progress` en ont des faux qu'il
  faudrait toucher.

## D4. Budget : point d'ancrage à 1 page, « trop peu » accepté

- **Choix** : en plus des repères 5, 25 et 60 pages, un point à 1 page
  (5–10 notions clés, 2–4 QCM, 1–2 questions libres). Sous 1 page, la
  fourchette reste celle d'1 page. Entre deux points, l'interpolation est
  linéaire. Au-delà de 60 pages, la fourchette est plate.
- **Choix** : si le modèle rend moins de notions clés que le minimum, on
  accepte sans relancer. Au-dessus du maximum, le code coupe. Seul le
  plafond est dur.
- **Écarté** : relancer sous le minimum. Un cours pauvre en contenu
  forcerait le modèle à inventer des notions.
- **Raison** : le problème à corriger est l'excès. L'eval mesure si le
  minimum est atteint.

## D5. Limite de longueur de cours

- **Choix** : au-delà de 400 000 caractères (environ 270 pages), le job
  échoue définitivement avec un message clair.
- **Raison** : l'appel unique doit tenir dans le contexte du modèle.
  400 000 caractères font environ 160 000 tokens au ratio prudent de
  2,5 caractères par token. Le Tuteur n'a aucune limite de ce genre, ce
  qui est un risque existant, non traité ici.

## D6. Libellé du bouton : « Créer les fiches » conservé [à relire]

- **Choix** : le déclenchement unique garde le libellé « Créer les
  fiches ».
- **Écarté** : « Générer les cartes », tel que cité dans la consigne.
  L'application dit « fiches » partout (« Réviser N fiches », « fiches
  créées »). Introduire « cartes » sur un seul bouton mélangerait deux
  mots pour la même chose.
- **À trancher** : si « Générer les cartes » était un libellé voulu, c'est
  une constante à changer, plus le test Playwright.

## D7. L'ancien flux reste côté API, l'interface ne l'appelle plus [à relire]

- **Choix** : l'interface n'appelle plus que le nouveau déclenchement.
  `POST /api/notions/:id/generate`, `POST /api/documents/:id/generate` et
  le handler `generate-cards` restent en place.
- **Raison** :
  - CLAUDE.md interdit de supprimer un test existant, et ces routes ont
    leurs tests d'intégration.
  - Le handler termine aussi les jobs `generate-cards` encore en file au
    moment du déploiement.
- **Proposition** : un commit de suppression à part, si tu autorises la
  suppression des tests liés.

## D8. Règle QCM « aucune option dépendante de la position » [à relire]

- **Constat** : cette règle n'existait pas dans le code. Seules existaient
  la longueur comparable des distracteurs (`optionLengthsArePlausible`),
  la présence de la bonne réponse et des options distinctes.
- **Choix** : elle est ajoutée au nouveau flux sous deux formes :
  - un invariant de domaine qui rejette les options du type « toutes les
    réponses ci-dessus », « aucune des réponses », « A et B », « les deux
    premières » ;
  - un mélange déterministe des options avant l'écriture, pour que la
    bonne réponse ne soit pas toujours à la même place. Rien ne mélange
    les options aujourd'hui, ni à la génération ni à l'affichage.
- L'ancien générateur n'est pas modifié (D7).

## D9. Écart TDD sur le handler du job de cours [à relire]

- **Constat** : j'ai écrit `handle-course-generation-job.unit.test.ts` puis
  l'implémentation à la suite, sans lancer les tests entre les deux. Je n'ai
  donc pas vu le rouge pour la bonne raison, seulement l'absence du module.
- **Rattrapage** : cinq mutations ciblées sur les garanties du handler,
  toutes tuées :
  - garde « cours existant jamais touché » ;
  - enregistrement des notions clés avant la génération ;
  - ordre du cours des sources ;
  - plafond ;
  - limite de longueur.
- **Même constat** pour les deux tests d'intégration du job avec une vraie
  base : ils sont écrits après le code. Ce sont des tests de câblage et de
  la règle 2 (aucun appel au modèle dans une transaction), pas des tests
  qui pilotent la conception.
- Tous les autres tests de la mission ont été observés rouges avant le
  code.

## D10. Relance des lots : seulement les notions clés sans carte valide

- **Choix** : dans un lot, chaque carte est validée une à une (invariants
  QCM, fuite de la réponse, référence connue). La relance unique ne
  redemande que les notions clés restées sans carte valide, avec la raison
  pour chacune. Si une notion clé reste sans carte après la relance, l'appel
  échoue, et le job aussi (CLAUDE.md règle 4).
- **Écarté** : les `.refine()` dans le schéma, comme l'ancien générateur.
  Une seule carte invalide ferait alors échouer le lot entier et
  relancerait les 15 cartes.
- **Écarté** : accepter une notion clé sans carte après la relance. La
  règle 4 dit d'échouer, et « une flashcard par notion clé » ne serait plus
  garanti.
- **Coût d'un échec** : les notions clés sont déjà enregistrées. La reprise
  du job ne refait que les lots, pas l'extraction.

## D11. Une carte est rattachée à la première notion de lecture couverte

- `cards.notion_id` reçoit la première notion de lecture de la notion clé,
  dans l'ordre du cours. La révision « par notion » et la progression par
  notion voient donc ces cartes sous cette notion de lecture.
- Les autres notions de lecture couvertes ne se lisent que via
  `key_notion_sources`. Rien dans l'interface ne les affiche encore :
  la citation multi-sources dans le Lecteur reste à faire.

## D12. Statut de génération : `total = 1` pour un job de cours

- `GET /api/documents/:id/generation-status` garde sa forme
  `{ done, total, failed }`. Quand un job de cours existe, il le rapporte
  seul. Sinon, la route garde son ancien comportement (jobs par notion).
- **Écarté** : une nouvelle forme `{ status }`. Elle aurait cassé le
  contrat et ses tests sans rien apporter de plus.

## D13. Les notions clés sont dédoublonnées par titre normalisé

- **Choix** : deux titres sont identiques s'ils le sont sans casse, sans
  accents, sans ponctuation et sans article initial. La seconde notion est
  fusionnée dans la première, qui garde sa partie.
- **Limite connue** : deux formulations différentes de la même idée
  (« Rôle de l'Agent Card » et « À quoi sert l'Agent Card ») ne sont pas
  détectées en code. Le prompt demande au modèle de les éviter, et l'eval
  mesure en plus une similarité lexicale entre titres.
- **Limite connue** : si une fusion retire la seule notion clé d'une
  partie, cette partie devient non couverte. Le code ne le rattrape pas,
  et l'eval le mesurerait.
