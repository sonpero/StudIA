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

## D14. Evals : sources, mesures et blocage de facturation [à relire]

- **Cours** :
  - A2A découpé à l'exécution dans ton PDF, non versionné : chapitres 1–2
    (8 173 caractères, 5,4 pages) et chapitres 1–6 (36 248 caractères,
    24,2 pages). Le texte du PDF n'est jamais copié dans le dépôt.
  - Troisième cours : l'article « Révolution française » de Wikipédia,
    révision figée, de l'introduction à « Première République » (100 174
    caractères, 66,8 pages). Licence CC BY-SA, attribution dans
    `evals/golden-key-notions/SOURCES.md`.
  - A2A complet ne fait que 43 pages : l'assembler avec un autre cours
    aurait donné un « cours » sans unité, d'où un sujet distinct et long.
- **« Avant »** : la formule du diagnostic (notions de lecture × 3 types ×
  1 à 5, environ 3,5 en moyenne), appliquée au nombre réel de notions de
  lecture que l'eval obtient. Aucune génération par l'ancien flux, comme
  demandé.
- **Couverture** : la vérification indépendante compare les parties
  déclarées par le modèle à une liste de parties écrite à la main (D2).
- **Garde-fou de dépense** : `evals/spend-guard.ts` tient un registre
  persistant entre les passages. Il refuse tout appel dont le pire cas
  (entrée estimée, plus la totalité de son `max_tokens` en sortie) ferait
  dépasser 10 $. Tarifs : claude-sonnet-5 à 2 $ / 10 $ par million de
  tokens, vérifiés le 2026-10-03.
- **Blocage** : le premier passage payant (a2a-5p) a été refusé dès le
  premier appel : « Your credit balance is too low to access the Anthropic
  API ». Rien n'a été dépensé (0 $). Il n'y a pas d'autre clé ni d'autre
  source d'identifiants configurée pour ce projet. L'essai à blanc
  (`DRY=1`, adaptateurs fixture) a validé toute la chaîne.
- **Commande pour relancer** une fois le compte crédité :
  `set -a; . ./.env; set +a; SPEND_LEDGER=<fichier> pnpm vitest run --config vitest.eval.config.ts evals/run-key-notions.eval.test.ts`,
  avec `CASE=a2a-5p` pour commencer petit.
- **Estimation** pour les trois cours : environ 2 à 3 $ au total. Le
  découpage en est la plus grosse part (environ 1,3 $). L'extraction et
  la génération coûtent chacune moins de 0,7 $.

## D15. Interface : tests existants modifiés [à relire]

L'ancienne interface (cases par type, « Régénérer les fiches », compteur
« N / M fiches créées ») est retirée par ta décision 5. Les tests qui
portaient sur elle ont été adaptés au plus petit changement qui garde leur
intention. Aucun test n'a été supprimé, aucune assertion sans lien avec
l'interface retirée n'a été affaiblie. Le travail a été fait par un
sous-agent, puis relu et relancé par moi : 1 621 tests unitaires et
d'intégration, 58/58 e2e.

### `NotionsScreen.unit.test.tsx`, 4 tests modifiés

- **« appel au point d'entrée de génération »** : il attend désormais
  `POST …/cards/generate` et vérifie que l'ancienne route n'est pas
  appelée.
- **« décocher tous les types / Régénérer »** : réécrit en « un cours qui
  a des cartes n'a aucun déclencheur ».
- **« suivi par generation-status »** :
  - le statut factice passe par « inactif », puis « en cours », puis
    « terminé » ;
  - l'assertion `1 / 3` devient le message « en cours ».
- **« cible tactile de 44 px des cases »** : la mesure porte désormais sur
  le bouton « Créer les fiches ».

### E2E

- **Attente de la fin de génération** : `done + failed === notionCount`
  devient `=== 1`, puisqu'il n'y a plus qu'un job par cours. Specs
  concernés :
  - `progress` ;
  - `streak-and-countdown` ;
  - `today-mobile` ;
  - `today` ;
  - `generate-and-review` (ses 2 tests).
- **`generate-and-review`** : la boucle « noter chaque carte due de la
  notion » sait aussi répondre aux QCM et aux questions libres, puisqu'une
  notion mélange maintenant les trois types.
- **`activity-types`**, tests QCM et question libre :
  - plus de sélection du type ;
  - les autres cartes sont répondues jusqu'à atteindre le type visé ;
  - l'index se lit dans « QCM N ? ».
- **`notions-mobile`** : la mesure de 44 px porte sur le bouton au lieu
  du libellé des cases.

### Nouveau

- `e2e/course-cards.spec.ts` : le critère Playwright de M11, observé
  rouge contre l'ancienne interface (cases présentes, puis attente
  `{done:1,total:1}` jamais atteinte : 5 jobs par notion), puis vert.
- 9 nouveaux tests unitaires de NotionsScreen.

### Fragilité signalée

L'étape « session de tout le cours » de `generate-and-review` suppose que
la première carte est une flashcard. C'est vrai aujourd'hui parce que les
flashcards sont écrites en premier.

## D16. Données personnelles : vérification et réécriture de la branche

- **Adresse gmail** : absente partout.
  - Fichiers suivis et non suivis.
  - Contenu des 8 commits de la branche et de tout l'historique du dépôt.
  - Métadonnées des commits.
  - Elle n'avait été envoyée qu'une fois, dans l'en-tête User-Agent d'une
    requête `curl` lancée à la main vers l'API de Wikipédia, qui n'a jamais
    été versionnée.
- **Autre adresse trouvée** : ton adresse professionnelle, en auteur
  et en committer de tous les commits :
  - les 196 commits de `main`, déjà publics ;
  - les 8 commits de la branche.
- **Choix** :
  - Les 8 commits de la branche, jamais poussés, ont été réécrits avec
    `git filter-branch --env-filter` : auteur et committer passent à
    l'adresse noreply GitHub du compte
    (`44258422+sonpero@users.noreply.github.com`), déjà présente sur deux
    commits de `main`. Le contenu est identique : le diff avec la
    sauvegarde locale est vide. Dates et messages sont inchangés.
  - Les commits suivants de la mission utilisent la même adresse, par
    variables d'environnement (`GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_EMAIL`),
    sans modifier ta configuration git.
- **Non fait, à décider par toi** : réécrire l'historique de `main`. Il
  faudrait forcer le push de `main`, ce qui sort du cadre (« ne fusionne
  pas dans main »), et casserait tout clone existant. Pour la suite :
  - définir `git config user.email` sur l'adresse noreply dans ce dépôt ;
  - cocher « Keep my email addresses private » sur GitHub.
- **Wikipédia** : `SOURCES.md` indique comment refaire la requête sans
  donnée personnelle (identifiant générique, ou variable d'environnement
  non versionnée). L'eval ne fait elle-même aucune requête à Wikipédia :
  elle lit le fichier versionné.

## D17. Ajustements après la première eval réelle (a2a-5p) [à relire]

Constats sur 11 cartes relues, puis corrections. Au plus 2 itérations par
problème.

- **Sections absentes de la sortie** : au premier essai, le modèle omet
  parfois le champ `sections` et ne rend que `keyNotions`. La relance le
  corrige, mais un passage a échoué sur ses deux essais.
  - **Correction (prompt)** : « Ta réponse contient deux champs, tous deux
    obligatoires : sections, puis keyNotions. »
  - **Résultat** : l'extraction réussit ensuite au premier appel sur les
    passages suivants.
- **Volume sous le minimum** : 12 notions clés pour 12 notions de lecture,
  au lieu de 16 au moins.
  - **Itération 1 (prompt)** : « jamais moins de N ». « Une notion de
    lecture contient souvent plusieurs notions clés. » Résultat : 19, dans
    les bornes, puis 15 au passage suivant. Le modèle varie d'un passage à
    l'autre.
  - **Itération 2 (code)** : sous le minimum, l'extracteur redemande une
    fois en citant l'écart, puis garde la réponse valide la plus fournie.
    Le job n'échoue jamais pour cette raison. **Amende D4** : avant, « trop
    peu » était accepté sans relance.
  - **Tests** : les tests de contrat de l'extracteur, écrits sur cette
    branche et jamais fusionnés, avaient un budget minimum de 5 avec une
    réponse de 2 notions. Ce minimum passe à 2, et deux chaînes de prompt
    attendues sont ajustées en conséquence. Sinon chaque réponse valide
    aurait déclenché la nouvelle relance.
- **Flashcards composées** : « Pourquoi… et comment… », « Qui a lancé A2A,
  et quelle gouvernance et quel soutien… ».
  - **Correction (prompt)** : « Une flashcard interroge un seul fait :
    jamais deux questions reliées par « et », jamais une énumération. »
  - **Résultat** : les 5 flashcards relues après correction portent chacune
    sur un seul fait.
- **Synthèses qui n'en sont pas** : « Règles de génération des
  identifiants » est un tableau à restituer.
  - **Correction (prompt)** : une synthèse relie plusieurs idées et se
    raisonne. « Un tableau ou une liste à restituer n'est pas une
    synthèse. »
  - **Résultat** : les 3 synthèses suivantes relèvent toutes du
    raisonnement (règle d'or Message ou Artifact, choix entre Message et
    Task, logique d'intégration).
- **QCM dont la bonne réponse se repère à sa longueur** : c'est l'option
  la plus longue dans 7 QCM sur 9 (25 % attendus par hasard), jusqu'à
  1,5 fois le distracteur le plus long. Certains distracteurs étaient
  absurdes.
  - **Itération 1 (prompt)** : « La bonne réponse ne doit être ni la plus
    longue ni la plus précise des quatre. » Aucun effet : 7 sur 9.
  - **Itération 2 (code)** : nouvel invariant `answerStandsOutByLength`.
    Un QCM est rejeté, puis redemandé une fois avec la raison, si la bonne
    réponse dépasse de plus de 20 % le distracteur le plus long. Test
    unitaire, deux mutations tuées.
  - **Résultat** : plus aucun écart au-delà de 20 %. La bonne réponse reste
    pourtant la plus longue dans 5 cas sur 9 (56 %), de peu.
  - **Problème ouvert** (2 itérations atteintes) : seuil plus strict, ou
    consigne d'écrire les distracteurs avant la bonne réponse.
- **Eval** :
  - quasi-doublons de questions (Jaccard ≥ 0,6, même type) ;
  - taux de QCM dont la bonne réponse est la plus longue ;
  - copie de toutes les cartes, hors dépôt, pour la relecture ;
  - copie des réponses brutes (`RAW_DIR`, hors dépôt), pour diagnostiquer
    un échec de schéma.

## D20. Suppression de l'ancien flux (D7 validée)

- **Supprimé** :
  - les routes `POST /api/notions/:id/generate` et
    `POST /api/documents/:id/generate` ;
  - le handler et le type de job `generate-cards` du worker ;
  - `handleGenerationJob` et `generateForNotion` ;
  - le port `CardGenerator` et ses deux adaptateurs (Claude, fixture) ;
  - `diffCards` et `isValidCardCount` ;
  - la branche « jobs par notion » de `getGenerationStatus`.
- **Tests supprimés avec eux** :
  - les fichiers de test des modules ci-dessus, y compris les tests de
    régression du correctif diffCards (D1), dont le flux disparaît ;
  - dans `cards.int.test.ts`, les 6 tests des deux routes ;
  - dans `get-generation-status.unit.test.ts`, le test des jobs par
    notion.
- **Gardé** : `CardRepository.applyCardChanges`, la méthode d'écriture
  générique du dépôt. Ses tests d'intégration s'en servent pour préparer
  les autres tests (`findCard`, `deleteCard`, `markStale`), qui gardent
  tout leur sens.
- **Vérifié** :
  - plus aucun appel à l'ancien flux dans le code (`git grep`) ;
  - les cours existants restent lisibles et révisables : la table `cards`,
    le module `review`, `GET /api/notions/:id/cards` et
    `DELETE /api/cards/:id` sont inchangés, et les tests e2e de révision
    passent (§ clôture).
- **Jobs `generate-cards` encore en file au déploiement** : le worker les
  passe en échec définitif avec « No handler registered for job type ».
  Aucune donnée n'est touchée, et ce comportement existe déjà, testé dans
  le noyau `jobs`.
- **Eval historique** `evals/run.eval.test.ts` : elle utilise désormais le
  générateur par lots, avec un lot d'une notion clé sur la première notion
  de lecture.

## D18. Cours long : sortie tronquée, puis fiabilité des lots [à relire]

Trois échecs successifs sur le cours d'environ 67 pages, corrigés à la
source.

1. **Extraction tronquée à 16 000 tokens.** L'appel est coupé en plein
   outil, donc aucun argument n'est lisible. Cause probable : la consigne
   ajoutée en D17 (« une notion de lecture contient souvent plusieurs
   notions clés »), appliquée à un cours qui a environ 170 notions de
   lecture pour 70 à 90 notions clés.
   - **Correction** : cette consigne n'apparaît plus que si le cours a au
     plus autant de notions de lecture que le minimum. Sinon, le prompt
     demande de regrouper. Il dit aussi « jamais plus de N ».
   - **Sorties plus courtes** : résumé de 120 caractères au plus (200
     avant), trois références au plus par notion clé.
   - **Résultat** : 12 561 tokens de sortie, sous la limite d'un appel non
     streamé, comme tu l'exiges.
2. **Le nouvel invariant de longueur (D17) faisait échouer le job** : 2
   QCM sur environ 45 restaient « nettement plus longs » après la relance.
   - **Correction** : la longueur est une heuristique de qualité. Après la
     relance, un QCM dont c'est le seul défaut est gardé.
3. **Un QCM sur environ 45 restait hors de l'heuristique historique** de
   longueur des options, deux fois de suite. Le job entier échouait encore
   pour une seule carte.
   - **Correction, qui amende D10** : après la relance, seule une
     flashcard manquante fait échouer l'appel, puisque la flashcard est la
     garantie « une question par notion clé ».
   - Un QCM ou une question libre encore faux est **écarté**, jamais gardé
     faux. Sa notion clé garde sa flashcard.
   - Un échec d'appel entier (schéma invalide aux deux essais) fait
     toujours échouer le job, comme le veut la règle 4 de CLAUDE.md.
   - Lecture de la règle 4 : une sortie d'appel valide dans laquelle
     quelques cartes sont écartées est un résultat dégradé, traité comme
     un résultat (docs/TESTING.md, cas `degraded`), pas un échec de
     validation de l'appel.
- **Tests modifiés** (écrits sur cette branche, jamais fusionnés), dans
  `claude-key-notion-card-generator.contract.test.ts` :
  - « une notion clé sans carte après relance fait échouer l'appel »
    porte désormais sur une flashcard ;
  - le test des QCM « position » et « longueur » attend que les cartes
    soient écartées, et non plus un échec ;
  - un test ajouté vérifie l'abandon d'une question libre ;
  - les données du test « bonne réponse nettement plus longue » sont
    isolées, pour ne plus casser aussi l'heuristique historique, qui est
    maintenant vérifiée en premier.

## D19. Sorties malformées du découpeur sur claude-sonnet-5

Sur le cours de 67 pages, le découpeur existant (module `content`) a
échoué deux fois :
- le tableau `elements` revient sous forme de chaîne JSON ;
- à la relance, le champ `difficulty` manque sur toutes les notions. Le
  retour envoyé au modèle ne disait que « response did not match schema ».

Corrections :
- **Réparation du texte avant validation**, avec
  `experimental_repairText` de `generateObject` et une fonction pure
  `unwrapStringifiedJson` (`content/domain`, exportée par son
  `index.ts`). Elle est appliquée au découpeur et aux deux adaptateurs
  des notions clés.
- **La relance cite la cause de l'erreur**, c'est-à-dire les problèmes
  Zod qui nomment le champ fautif.
- **Tests** : nouveaux tests seulement, aucun test existant modifié. Un
  premier test du retour était vide de sens : le corps de la requête
  contient toujours « difficulty » via le schéma de l'outil. Il ne lit
  plus que la phrase de retour.

## D21. Eval finale et relecture qualitative

Les trois cours ont été passés sur le code final (`2026-10-03-key-notions-<cas>.md|json`). Les itérations intermédiaires sont gardées à côté (`-iter0` à `-iter3`, `-before-d18`). Dépense totale de la mission, échecs compris : **7,36 $ sur 10 $**.

- **Seuils de quasi-doublon** (similarité de Jaccard sur les mots normalisés, mots vides exclus) :
  - 0,5 entre titres de notions clés : ce sont des groupes nominaux courts, donc partager la moitié de leurs mots est déjà suspect ;
  - 0,6 entre questions du même type : elles sont plus longues et partagent leur tournure interrogative.
- **Paires signalées, toutes relues : aucune n'est un doublon.**
  - « Machine à états » / « États terminaux d'une Task » : deux aspects distincts.
  - « Girondins » / « Montagnards » : deux factions.
  - « Hébertistes » / « Dantonistes » : deux procès.
  - Le seuil de 0,5 sur les titres signale donc des notions parallèles, pas des répétitions.
- **Position de la bonne réponse**, sur les trois cours réunis : 21 / 25 / 16 / 19 sur 81 QCM.
  - Le khi-deux vaut environ 2,1 pour 3 degrés de liberté (p ≈ 0,55) : la répartition est uniforme.
  - Le mélange est déterministe : il dépend d'une empreinte de la question.
- **Relecture** de 31 cartes au total : 11 sur a2a-5p (première itération), 10 sur a2a-25p, 10 sur le cours de 67 pages.
  - Toutes sont fidèles au texte source.
  - Après correction, les flashcards portent sur un seul fait et les questions libres sont de vraies synthèses (causes, comparaisons, choix).
  - **Défaut restant** : dans certains QCM, la bonne réponse se repère encore parce qu'elle est un peu plus longue et plus précise que les distracteurs, tout en restant sous le seuil de 20 %. Exemples : Jeu de paume (76 caractères contre 65 au plus pour les distracteurs) ; « Monsieur Veto », où la bonne réponse ajoute un détail. Taux final de QCM dont la bonne réponse est l'option la plus longue : 3/8, 9/29 et 25/45, contre 25 % au hasard. Problème laissé ouvert après 2 itérations (D17).
  - **Défaut mineur** : quelques questions de pure mémorisation (« Selon quelle norme… ? RFC 8615 »). Elles sont fidèles, mais apportent peu.
- **Surproduction sur le cours long** : le modèle déclare 69 notions essentielles pour 35 à 45 demandées, et 31 synthèses pour 12 à 15. Les plafonds en code ramènent le volume à 45 QCM et 15 questions libres. Il n'y a pas de tri par importance au-delà de l'ordre du cours : ce sont les 45 premières essentielles qui gardent un QCM.
