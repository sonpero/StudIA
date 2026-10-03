# Rapport — notions clés et budget de cartes (M11)

Branche `feat/key-notions-card-budget`, poussée, non fusionnée dans `main`,
rien de déployé. Journal des décisions : `notions-cles-decisions.md` (D1 à
D21). Conception : `notions-cles-conception.md`. Résultats bruts :
`evals/results/2026-10-03-key-notions-*.md|json`.

## 1. Données personnelles (étape 1)

- **Ton adresse gmail n'apparaît nulle part** : ni dans les fichiers, ni
  dans le contenu des commits du dépôt, ni dans leurs métadonnées. Elle
  n'avait été envoyée qu'une fois, dans l'en-tête d'une requête `curl`
  lancée à la main vers Wikipédia, jamais versionnée.
- **Une autre adresse personnelle a été trouvée** : l'adresse
  professionnelle, en auteur et en committer de tous les
  commits.
  - Les 8 commits de la branche, jamais poussés, ont été réécrits avec
    l'adresse noreply GitHub du compte. Le contenu est identique.
  - Mon erreur : j'avais ensuite écrit cette adresse en clair dans le
    journal (D16). Avant la poussée, un second passage
    (`git filter-branch --tree-filter`) l'a remplacée dans chaque commit de
    la branche. L'historique poussé n'en contient plus aucune occurrence
    (contrôle : `git log main..HEAD -p`).
  - Tous les commits suivants utilisent la même adresse noreply, sans
    toucher à ta configuration git.
- **Reste à décider par toi** : les 196 commits de `main` portent toujours
  l'adresse professionnelle. Les réécrire obligerait à forcer le push de
  `main`, ce qui sort du cadre de cette mission.
- **Recommandations** :
  - `git config user.email 44258422+sonpero@users.noreply.github.com`
    dans ce dépôt ;
  - « Keep my email addresses private » sur GitHub.
- **Wikipédia** : `evals/golden-key-notions/SOURCES.md` explique comment
  l'interroger sans donnée personnelle (D16).

## 2. Résultats par cours (code final)

**Règle 6 (CLAUDE.md, 2026-10-03)** : aucune eval réelle sur un document de
plus de 5 pages sans ton accord explicite.
- Les colonnes 25 et 67 pages ci-dessous viennent du seul passage réel fait
  avant la règle. Elles ne seront pas renouvelées sans ton accord.
- La validation courante de ces longueurs passe par :
  - les tests ;
  - l'essai à blanc `DRY=1 DRY_EXTRACTOR=overshoot` ;
  - le rejeu (`REPLAY=1`) des réponses enregistrées d'a2a-5p.
- Coût dépensé depuis la recharge : **7,36 $** (176 appels). Rejeux et
  essais à blanc : 0 $.

| | A2A ch. 1–2 | A2A ch. 1–6 | Révolution française |
|---|---|---|---|
| Caractères ; pages | 8 173 ; 5,4 | 36 248 ; 24,2 | 100 174 ; 66,8 |
| Notions de lecture | 11 | 64 | 164 |
| **Avant** (formule du diagnostic : min / typique / max) | 33 / 116 / 165 | 192 / 672 / 960 | 492 / 1 722 / 2 460 |
| Notions clés (essentielles, synthèses déclarées) | 20 (8, 5) | 56 (33, 16) | 90 (69, 31) |
| **Flashcards** (borne) | 20 (16–26) ✓ | 56 (39–59) ✓ | 90 (70–90) ✓ |
| **QCM** (borne) | 8 (6–10) ✓ | 29 (19–29) ✓ | 45 (35–45) ✓ |
| **Questions libres** (borne) | 4 (2–4) ✓ | 12 (8–12) ✓ | 15 (12–15) ✓ |
| **Total** (plafond 150) | 32 | 97 | 150 |
| Parties déclarées / parties de référence retrouvées | 2 / 2 sur 2 | 7 / 6 sur 6 | 14 / 6 sur 6 |
| Notions de lecture couvertes | 11 / 11 | 64 / 64 | 133 / 164 |
| Doublons de titre | 0 | 0 | 0 |
| Titres proches (Jaccard ≥ 0,5) | 0 | 1, distincts | 2, distincts |
| Questions proches, même type (Jaccard ≥ 0,6) | 0 | 0 | 0 |
| Position de la bonne réponse (1/2/3/4) | 2/0/4/2 | 8/12/3/6 | 12/11/11/11 |
| Bonne réponse = option la plus longue (hasard : 25 %) | 3/8 | 9/29 | 25/45 |
| Appels (découpage + notions clés + génération) | 1 + 1 + 5 | 6 + 1 + 11 | 14 + 1 + 17 |
| Tokens d'entrée / de sortie | 25 000 / 10 300 | 112 400 / 47 200 | 236 500 / 89 300 |
| Coût | 0,15 $ | 0,70 $ | 1,37 $ |

- **Position de la bonne réponse**, les trois cours réunis : 21 / 25 / 16 /
  19. Le khi-deux vaut environ 2,1 (p ≈ 0,55) : la répartition est
  uniforme.
- **Coût hors découpage**, qui existait déjà :
  - 0,10 $ pour 5 pages, 0,34 $ pour 25 pages, 0,61 $ pour 67 pages ;
  - environ 12 appels pour un cours de 25 pages, contre environ 190 dans
    l'ancien flux.
- **Dépense totale de la mission** : 7,36 $ sur 10 $, échecs et itérations
  compris.

## 3. Défauts de qualité constatés

J'ai relu 31 cartes. Toutes sont fidèles au texte source.

| Défaut | Exemple | Correction | État |
|---|---|---|---|
| Flashcards composées | « Qui a lancé A2A, **et** quelle gouvernance **et** quel soutien… ? » | Prompt : « une flashcard interroge un seul fait » | Corrigé |
| Fausses synthèses | « Règles de génération des identifiants » : un tableau à réciter | Prompt : une synthèse relie des idées. « Un tableau à restituer n'en est pas une » | Corrigé |
| Distracteurs absurdes | « Être à la fois Agent Card et Contexte » | Prompt : même forme, même niveau de détail, chaque distracteur « pourrait tromper » | Amélioré |
| Bonne réponse repérable à sa longueur | 7 QCM sur 9 au départ, jusqu'à 1,5 fois le distracteur le plus long | Itération 1 : prompt, sans effet. Itération 2 : invariant en code qui rejette au-delà de 20 % | Partiel : la bonne réponse reste la plus longue dans 31 à 56 % des QCM, de peu, et parfois plus précise (« Monsieur Veto »). **Ouvert** |
| Questions de mémorisation pure | « Selon quelle norme… ? RFC 8615 » | Aucune | Ouvert, mineur |

Pannes techniques pendant l'eval, toutes corrigées :
- **Champ `sections` omis** par le modèle : le prompt l'exige désormais
  explicitement.
- **Extraction tronquée** à 16 000 tokens sur le cours long : le prompt
  demande de regrouper les notions et des sorties plus courtes. La sortie
  tombe à 12 000 tokens.
- **Job entier en échec pour un seul QCM** : après la relance, une carte de
  QCM ou une question libre encore invalide est écartée. Seule une
  flashcard manquante fait échouer l'appel.
- **Tableau renvoyé sous forme de chaîne JSON** par le découpeur : la
  sortie est réparée avant validation.
- **Champ `difficulty` perdu à la relance** : le message de relance nomme
  désormais le champ fautif.

## 4. Ajustements

- **`CARD_BUDGET` : inchangé.** Les trois cours tombent dans les bornes du
  milestone.
- **Prompt d'extraction** :
  - les deux champs sont obligatoires ;
  - « jamais moins de N », « jamais plus de N » ;
  - si le cours a peu de notions de lecture, le prompt demande de les
    découper ; s'il en a beaucoup, de les regrouper ;
  - la synthèse est définie strictement ;
  - résumé de 120 caractères au plus, 3 références au plus.
- **Relance sous le minimum** : une seule, puis le résultat le plus fourni
  est gardé, sans échec du job. Cela amende D4.
- **Prompt de génération** :
  - un seul fait par flashcard ;
  - la bonne réponse n'est ni plus longue ni plus précise que les
    distracteurs.
- **Code** :
  - invariant `answerStandsOutByLength` (seuil de 20 %), traité comme un
    défaut léger : le QCM est redemandé une fois, puis gardé ;
  - abandon des QCM et questions libres encore invalides après la
    relance ;
  - `unwrapStringifiedJson` pour réparer les sorties.
- Chaque changement répond à un défaut mesuré, avec au plus 2 itérations
  par problème (D17, D18, D19).

## 5. Critères d'acceptation de M11

| Critère | État |
|---|---|
| Volume dans les bornes, ~5 pages | ✅ mesuré avec le modèle : 20/8/4. Rejouable sans coût (`REPLAY=1`) |
| Volume dans les bornes, ~25 et ~60 pages | ✅ **garanti en code** : tests du handler et essai à blanc avec une extraction qui demande le double du maximum (26/10/4, 59/29/12, 90/45/15, jamais plus de 150). Une seule mesure réelle existe (56/29/12 et 90/45/15), faite avant la règle 6 ; elle ne sera pas renouvelée sans ton accord |
| Toutes les parties couvertes, ~5 pages | ✅ mesuré avec le modèle : 2 parties sur 2 |
| Toutes les parties couvertes, ~25 et ~60 pages | ✅ **garanti en code** pour les parties déclarées par le modèle (relance, puis échec si une partie manque ; le plafond garde une notion clé par partie, testé à 25, 60 et 200 pages). Une seule mesure réelle contre la référence écrite à la main (6 sur 6 et 6 sur 6), faite avant la règle 6 |
| Aucun doublon de notion clé | ✅ 0 titre identique. Les 3 paires de titres proches sont des notions distinctes |
| Cours existants intacts | ✅ migration additive testée ; le job et la route refusent un cours qui a déjà des cartes ; les tests e2e de révision passent après la suppression de l'ancien flux |
| Eval avec chiffres avant et après | ✅ ce rapport |
| Playwright | ✅ `course-cards.spec.ts`, plus `mcq-option-wrap.spec.ts` ; suite complète 60/60 |

En plus des critères :
- **Ancien flux supprimé** (D20).
- **Débordement des options de QCM corrigé** avec `<Button multiline>`,
  testé en 1 280 px et en 375 px.

## 6. Recommandation : prêt à fusionner

Les six critères sont atteints sur le modèle réel. La suite complète passe :
tests unitaires et d'intégration, typecheck, lint, dependency-cruiser, et 60
tests e2e. Les cours existants ne sont jamais touchés.

Trois réserves, aucune bloquante :
1. **QCM** : la bonne réponse est plus souvent la plus longue que ne le
   voudrait le hasard. C'est un défaut de qualité, pas de justesse.
2. **Cours long** : le modèle surproduit les notions essentielles. Le
   plafond garde les 45 premières dans l'ordre du cours, pas les 45 plus
   importantes.
3. **Une seule mesure par cours** sur le code final : un passage isolé dit
   peu (docs/TESTING.md). Sur a2a-5p, le nombre de notions clés a varié de
   15 à 20 d'un passage à l'autre.

Au déploiement :
- la migration 0013 s'applique ;
- les jobs `generate-cards` encore en file échouent proprement, sans
  toucher aux données.

## 7. Points ouverts

- **Règle de maîtrise** (stabilité de 21 jours ou plus, 3 répétitions par
  carte) :
  - avec environ 100 cartes au lieu d'environ 1 000 pour 25 pages, la
    progression devient atteignable ;
  - mais elle compte des cartes, pas des notions clés : une notion clé
    essentielle et de synthèse (3 cartes) pèse trois fois plus qu'une
    notion clé importante (1 carte).

  À rediscuter séparément.
- **Citation de plusieurs sources dans le Lecteur** : une carte pointe vers
  sa première notion de lecture. Les autres sont stockées dans
  `key_notion_sources`, mais pas encore affichées.
- **Limite du Tuteur** : aucune limite de longueur de cours, alors que
  l'extraction en a une (400 000 caractères).
- **Bouton « Régénérer »** : non implémenté. Il effacerait l'historique de
  révision de presque toutes les cartes. Il faudrait décider :
  - quelles cartes garder (celles déjà révisées) ;
  - si les notions clés sont refaites ;
  - comment supprimer les anciennes cartes dans la même transaction ;
  - comment migrer un cours de l'ancien flux.

  Le détail est dans la version précédente de ce rapport, commit
  `3b378cf`, § 5.
- **QCM dont la bonne réponse se repère**, pistes non essayées :
  - un seuil plus strict ;
  - demander au modèle d'écrire les distracteurs avant la bonne réponse ;
  - interdire un détail qui n'apparaît que dans la bonne réponse.
- **Tri des notions essentielles au-delà du plafond**, sur les cours longs :
  aujourd'hui l'ordre du cours, à terme peut-être un score de priorité.
- **Historique de `main`** : il contient l'adresse professionnelle (§ 1).
