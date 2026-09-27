# Rapport — notions des documents longs et échecs visibles

Branche `fix/long-documents-notions` (depuis `cad3dca`), non poussée.
Mission du 2026-09-27. Document de référence : le PDF de 43 pages
« Cours complet le protocole Agent2Agent (A2A) ».

## En bref

- **Suite du 2026-09-27 (seconde mission) : vérifié en réel.**
  - Sur `claude-sonnet-5`, A2A donne **111 notions pour un plafond de
    131**, en 7 min 31 s, pour 0,605 $.
  - Le modèle est configurable (`LLM_MODEL`), et le SDK n'envoie plus la
    `temperature: 0` que ce modèle refuse.
  - Une relance est refusée (409) quand des notions existent déjà.
  - Chaque chunk reçoit un budget de notions ; les budgets somment au
    plafond.
  - Les trois états de l'étape notions sont vérifiés à 375 px.
  - Détails : section « Suite du 2026-09-27 ». Les puces ci-dessous
    décrivent la première mission.
- **Chantier A (échec visible) : terminé.** Quand la création des notions
  échoue, Mes cours et l'écran Notions le disent, avec un bouton
  « Réessayer » qui ne relance que la création des notions.
- **Chantier B (documents longs) : terminé.** Nettoyage du PDF, découpage
  par taille, `maxTokens` explicite, troncature terminale, plafond
  proportionnel, doublons résolus sans échec.
- **Passage réel (un seul, 0,77 $) : techniquement propre, mais le document
  a été rejeté.** 9 appels sans troncature, mais le modèle a produit
  **315 notions** pour un plafond de 131. Le calibrage du plafond était faux
  d'un facteur ~3.
- **Correctif ajouté après le passage réel, non vérifié en réel** (vérifié
  depuis : voir la section « Suite du 2026-09-27 »). Le prompt
  donne désormais une cible de notions par chunk, et un dépassement du
  plafond devient terminal. Vérifier qu'A2A produit des notions valides
  demande un second passage payant (~0,80 $) que je n'ai pas lancé, la
  mission en autorisant un seul.
- `pnpm test` (200 fichiers, 1 463 tests), `pnpm typecheck` et `pnpm lint`
  sont verts. Playwright : 55/55 sur l'état final.

## Chantier A — échec visible

### Ce qui a été fait

- **Statut de l'étape notions** dans `content`, avec trois valeurs : en cours,
  prête, en échec.
  - Il est dérivé du dernier job `split-notions` de chaque document, via le
    port public `JobQueue.listJobs` : `pending` et `running` donnent
    « en cours », `done` donne « prête », `failed` donne « en échec ».
  - Un document sans job de découpage n'a pas d'entrée : c'est l'extraction
    qui n'est pas finie, et son statut à elle s'affiche comme avant.
  - Rien n'est dérivé du texte d'erreur.
  - Code : `content/domain/notion-step-status.ts`,
    `application/list-notion-statuses.ts`.
- **Relance** : `retryNotionSplit` n'enfile un nouveau job `split-notions`
  que si le document appartient à l'utilisateur et si son dernier découpage
  a échoué. L'extraction n'est jamais relancée.
- **Routes** (schémas Zod locaux à `apps/api`) :
  - `GET /api/notions/statuses` renvoie `[{ documentId, status }]`. Le schéma
    de réponse supprime tout autre champ, donc `lastError` ne peut pas
    atteindre le client.
  - `POST /api/documents/:id/notions/retry` renvoie 202, ou 403 (document
    d'un autre utilisateur ou inconnu), ou 409 (étape non échouée). C'est le
    même mapping que la relance d'extraction.
- **Web** :
  - Mes cours affiche « Création des notions… » pendant le découpage, puis,
    en cas d'échec, le message et le bouton « Réessayer ».
  - L'écran Notions affiche un état « en cours » (qui remplace l'ancien
    « reviens un peu plus tard » éternel) et un état « en échec » avec
    « Réessayer ».
  - Le polling tourne tant que l'étape est en cours.
- **Playwright** (`e2e/notion-split-failure.spec.ts`), deux scénarios. Le
  découpage est mis en échec directement en base, selon le précédent
  d'`upload-document.spec.ts`. Les deux vérifient l'état d'erreur sur Mes
  cours et sur Notions, puis que « Réessayer » ramène les 5 notions sans
  relancer l'extraction. Le test a été vu rouge (code web retiré) puis vert.

### Décision de modèle : un champ séparé servi par `content`

C'est un champ séparé, pas une nouvelle valeur du statut de document
d'`ingestion`, pour trois raisons :

- `packages/contracts/`, qui porte `documentSummarySchema`, est gelé.
- `ingestion` ne peut pas dépendre de `content` : `content` dépend déjà
  d'`ingestion`, cela créerait un cycle interdit par dependency-cruiser.
- L'étape notions relève de `content`.

La dérivation copie celle qu'`ingestion` fait déjà pour l'extraction.

## Chantier B — documents longs

1. **Nettoyage à l'ingestion** (`ingestion/domain/clean-extracted-text.ts`,
   appliqué avant `promoteHeadings`). Seules des lignes entières sont
   supprimées :
   - Pagination : `Page N`, `Page N of/sur/de M`, `p. N`, `N / M` (seulement
     si N ≤ M), `- N -`. Un nombre seul n'est jamais supprimé.
   - Lignes de ponctuation seule, sauf celles qui contiennent `{}[]` (du code
     non clôturé).
   - En-tête ou pied de page courant : ligne de plusieurs mots répétée à
     l'identique au moins max(3, ⌈0,4 × nombre de pages⌉) fois.
   - Les pages ne sont pas récupérables : officeparser 4.2.0 aplatit toutes
     les pages avant de joindre les lignes. Le nombre de pages est donc
     estimé à partir des marqueurs de pagination. Sans pagination, rien
     n'est supprimé.
   - `promoteHeadings` ne promeut plus une ligne qui finit par une virgule,
     commence par une minuscule ou une ponctuation de continuation, ou ne
     contient aucune lettre.
2. **Découpage par taille** (`content/domain/chunk-by-size.ts`) :
   - Cible de 10 000 caractères, maximum dur de 15 000, coupe uniquement
     entre deux paragraphes.
   - Un titre est une coupe préférée dès que le chunk est rempli à 70 %.
     Un chunk ne finit jamais sur un titre.
   - Un bloc de code clôturé n'est jamais coupé, et un tout petit dernier
     chunk est fusionné avec le précédent.
   - **Limite :** le code d'un PDF n'est jamais clôturé, donc un exemple de
     code peut être coupé entre deux lignes.
3. **`maxTokens` = 16 000.** La sortie maximale de `claude-sonnet-4-5`
   (64K) a été vérifiée sur la documentation officielle. Calcul :
   - Un chunk au maximum dur fait 15 000 caractères, soit environ
     5 000 tokens à 3 caractères par token (hypothèse prudente).
   - Sortie estimée : 1,5 × l'entrée, plus 15 % de JSON, soit environ
     8 600 tokens. 16 000 laisse une marge d'environ 1,85×.
   - C'est aussi le plafond confortable pour une requête non streamée, ce
     que fait `generateObject`.
4. **Erreurs** :
   - `finishReason: "length"` donne une erreur `truncated`. Le splitter ne
     la relance pas, et le job l'arrête en échec terminal.
   - Les erreurs de schéma gardent leur unique relance avec retour d'erreur
     au modèle.
   - Les erreurs réseau, 429/529 et 5xx restent relançables.
5. **Plafond** : `max(60, ⌈longueur / 500⌉)`, plancher de 5 inchangé.
   Cela donne 131 pour A2A.
6. **Doublons de titres** :
   - Le splitter reçoit les titres déjà produits par les chunks précédents
     (`avoidTitles`).
   - En filet de sécurité, les doublons restants sont renommés sans appel au
     modèle : `Titre (Section)`, puis `Titre (partie N)`, puis un compteur.
     L'unicité ignore la casse et les espaces autour, et les titres restent
     sous 80 caractères.
   - Les doublons ne font jamais échouer le document.
7. **Fixture** : `tests/fixtures/ingestion/a2a-course.pdf` (1,5 Mo), avec
   deux tests de contrat sans modèle (extraction puis découpage, environ
   0,6 s).

### Contournement du module `jobs` (gelé)

`runWorkerTick` ne permet pas à un handler de demander un échec terminal,
car `JobError` est une simple chaîne. `JobQueue.fail` accepte pourtant déjà
`{ terminal: true }`.

Le contournement vit dans `apps/worker/src/terminal-failures.ts` :

- `handleSplitJob` renvoie `terminal: true` à côté de son erreur.
- L'enveloppe du handler note l'identifiant du job dans un registre.
- Un décorateur de `JobQueue`, utilisé uniquement par la boucle du worker,
  passe alors `{ terminal: true }` au `fail()` suivant pour ce job.

`packages/core/src/jobs/` n'a pas été modifié. Un test d'intégration passe
par le vrai `runWorkerTick` et le vrai `SqliteJobQueue`.

## Après le passage réel : cible de granularité et dépassement terminal

Ce correctif est ajouté par moi après le passage réel (commit `84b1d5d`).

- **Cause** : le prompt ne donnait aucune indication de nombre. Avec des
  chunks d'environ 7 300 caractères, le modèle a fait environ 35 notions par
  chunk, soit une notion tous les ~208 caractères, de la taille d'une phrase.
- **Cible par chunk** (`content/domain/notion-count-target.ts`) : une notion
  pour 600 à 1 000 caractères, et au moins 5 si le chunk est le document
  entier. La fourchette est écrite dans le prompt :
  - « Vise entre X et Y notions pour cette partie. Une notion regroupe une
    idée complète avec ses détails, exemples et nuances : ne fais pas une
    notion par phrase, par champ ou par ligne de tableau. »
  - Pour A2A : 8 à 13 notions par chunk, 117 au plus au total, sous le
    plafond de 131.
- **Plafond conservé à une notion pour 500 caractères.** Le monter pour
  accepter 315 notions que personne n'a relues aurait plié la validation au
  résultat. Voir la question produit n° 1.
- **Dépassement du plafond désormais terminal.** Sinon le job relance le
  découpage complet 3 fois, soit environ 2,30 $ pour A2A, pour un écart
  (315 contre 131) qui ne se résorbera pas. Un nombre inférieur au plancher
  reste relançable.
- **Tests** : TDD, rouge observé pour la bonne raison. Test de mutation sur
  la fonction pure (7 mutations, toutes tuées) et sur les deux décisions du
  handler (5 mutations, toutes tuées ; une survivait au départ, un test a
  été ajouté pour la tuer).
- **Non vérifié en réel** : je ne sais pas si le modèle suit la cible.

## Tableau avant / après (PDF A2A, `scratchpad/repro.mts` relancé)

| | Avant (`cad3dca`) | Après |
|---|---|---|
| Markdown extrait | 70 037 car. | 65 399 car. |
| Lignes promues en `##` | 861 | 299 |
| Lignes en `#` (commentaires de code) | 8 | 8, sans effet sur le découpage |
| Lignes `Page N of 43` | 43 (36 promues en `##`) | 0 |
| En-tête courant « Cours complet : le protocole Agent2Agent (A2A) » | 43 | 0 (seul reste le titre du document en page 1) |
| Lignes de ponctuation seule | 56 `## ,` et d'autres (98 dans le texte brut) | 16, toutes `{ } [ ]`, gardées exprès |
| Chunks | 9, coupés par hasard sur des commentaires `#` : 45 767 / 438 / 554 / 630 / 321 / 1 246 / 3 132 / 337 / 17 596 | 9, coupés par taille : 7 006 à 7 593 (max 7 593) |
| Sortie maximale par appel | 4 096 (défaut du provider) | 16 000 |
| Plafond de notions | 60 | 131 |
| Cible de notions par chunk | aucune | 8 à 13 (après le passage réel) |

- **Bruit restant** : environ 300 faux titres `##`, surtout des cellules de
  tableau collées (« ObjectifTraduction concrète dans le protocole »,
  « DateÉtape ») et des identifiants (« A2A-Version »). officeparser ne
  donne aucun signal de style, et aucune règle sûre n'a été trouvée pour
  les retirer.
- Ces faux titres n'influencent plus le découpage que comme coupes
  préférées au-delà de 70 % de remplissage.

## Passage réel

**Estimation avant lancement : environ 0,55 $.**

- **Entrée** : environ 26 000 tokens, soit 0,08 $ à 3 $ le million.
- **Sortie** : environ 31 000 tokens, soit 0,47 $ à 15 $ le million.
- **Plafond théorique** : 18 appels à 16 000 tokens, soit environ 4,40 $.
  Un garde-fou dans le script refusait donc tout appel au-delà de 2 $
  dépensés.

Le passage a suivi le vrai chemin de code (`handleSplitJob` et
`ClaudeNotionSplitter` sur `claude-sonnet-4-5`) avec des dépôts en mémoire,
sans aucune écriture en base.

| Appel | Tokens d'entrée | Tokens de sortie | Fin | Durée |
|---|---|---|---|---|
| 1 | 3 285 | 4 433 | tool-calls | 84 s |
| 2 | 3 666 | 5 400 | tool-calls | 88 s |
| 3 | 4 206 | 3 044 | tool-calls | 68 s |
| 4 | 4 255 | 3 933 | tool-calls | 86 s |
| 5 | 4 530 | 2 866 | tool-calls | 66 s |
| 6 | 4 746 | 3 768 | tool-calls | 81 s |
| 7 | 5 130 | 7 723 | tool-calls | 141 s |
| 8 | 5 350 | 4 443 | tool-calls | 96 s |
| 9 | 6 020 | 7 456 | tool-calls | 150 s |
| **Total** | **41 188** | **43 066** | | **859 s (14 min 19 s)** |

- **Coût réel : 0,77 $** (tarif de 3 $/15 $ par million de tokens),
  environ 0,7 €.
- **Résultat : `Splitting produced 315 notions, expected 5 to 131`.**
  Aucune notion n'est écrite.
- **Ce qui a marché** : aucune troncature (la plus grosse sortie fait 7 723
  tokens sur 16 000) et aucune relance pour erreur de schéma.
- **Ce qui a échoué** : la granularité, corrigée par la section précédente
  mais sans vérification réelle.
- Durée : environ 1,5 minute par chunk. Un cours de 43 pages met donc près
  d'un quart d'heure à se découper.
- **Erreur de ma part :** mon script ne capturait pas les notions quand le
  job échoue. Les 315 notions sont perdues, et je ne peux rien dire de leur
  qualité.

## Vérifications

- `pnpm test` : 200 fichiers, 1 463 tests, verts (départ : 185 et 1 285).
- `pnpm typecheck` et `pnpm lint` (eslint et dependency-cruiser) : verts.
- **Playwright** : suite complète à 55/55 sur la branche intégrée (A et B),
  lancée avec `CI=1 --retries=0` pour interdire la réutilisation d'un
  serveur existant. Relancée sur l'état final (après `84b1d5d`) : 55/55
  à nouveau (4,1 min).
- Tests existants modifiés :
  - `handle-split-job.unit.test.ts`, « renumbers globally across chunks » :
    seul ajout, `chunking: { targetChars: 20, maxChars: 30 }` dans les
    dépendances ; assertions inchangées. Le découpage sur `#` qu'il
    supposait n'existe plus.
  - Le même fichier, « fails the job when two chunks independently produce
    the same title » : renommé, il attend maintenant un succès avec 10 titres
    uniques. C'est la règle que la mission remplace (ne jamais échouer sur
    des doublons).
  - Le même fichier, « reports the actual bounds when the count is above the
    cap » : ce test avait été écrit sur cette branche. Il attend maintenant
    `terminal: true` (ma décision après le passage réel).
  - Aucun test n'a été supprimé.

## Suite du 2026-09-27 — modèle, garde-fou, budget par chunk, vérification réelle, mobile

Seconde mission, même branche, mêmes règles. Ordre suivi : 1, 2, 3, puis 4
(le seul point payant), puis 5. La spec du point 5 a été écrite pendant que
le passage du point 4 tournait, après son lancement.

### 1. Modèle configurable (`6152579`)

- **Variable `LLM_MODEL`**, lue par l'API (`server.ts` → `app.ts` → les
  cinq `*-deps.ts`), par le worker (`index.ts`) et par les deux suites
  d'évaluation. Vide ou absente, elle vaut **`claude-sonnet-5`**. Elle est
  documentée dans `README.md` (nouvelle section « Environment variables »)
  et dans le nouveau `.env.example`.
- **Dans `shared/`, un seul fichier a changé : `model-client.ts`.**
  - Il change le modèle par défaut et fait retomber une valeur vide ou faite
    d'espaces sur ce défaut.
  - Il ajoute le correctif ci-dessous.
  - Côté tests : `model-client.contract.test.ts` est nouveau, et trois
    tests s'ajoutent à `model-client.unit.test.ts`.
- **Nom retenu : `LLM_MODEL`, pas `ANTHROPIC_MODEL`.** Claude Code lit
  lui-même `ANTHROPIC_MODEL` : une valeur exportée dans ton shell pour
  Claude Code aurait changé le modèle de l'app en local. `LLM_MODEL` suit
  aussi `LLM_ADAPTER`, déjà en place.
- **Paramètre refusé trouvé, et corrigé.** J'ai lu le code installé :
  - `ai@4.3.19` remplit `temperature: 0` sur **chaque** appel
    (`prepareCallSettings` : « TODO v5 remove default 0 for temperature »),
    et `@ai-sdk/anthropic@1.2.12` le transmet tel quel.
  - `claude-sonnet-5` répond 400 à toute `temperature`, `top_p` ou `top_k`
    différente de sa valeur par défaut. **Sans correctif, chaque appel de
    l'app aurait échoué.**
  - Correctif sans changer de version du SDK : `createLanguageModel`
    enveloppe le modèle avec un middleware (`wrapLanguageModel`, déjà
    exporté par `ai@4`) qui retire les trois paramètres. Aucun adaptateur ne
    les réglait volontairement.
  - Le test de transport (`model-client.contract.test.ts`, MSW) capture le
    corps réellement envoyé. Il a été vu rouge : la requête contenait
    `temperature`.
- **Autres points vérifiés :**
  - Le SDK n'envoie pas `thinking` sans option explicite, et aucun
    adaptateur n'en donne : rien à retirer.
  - `tool_choice: { type: "tool" }` (le mode objet de `generateObject`) est
    accepté par `claude-sonnet-5` sur l'API Claude. Seul Bedrock exigerait
    `thinking: disabled` avec.
  - Il n'y a pas de préremplissage (prefill).
  - Confirmé en réel : 10 appels sans aucune erreur 400.
- **Conséquence à connaître** : la température passe de 0 à la valeur par
  défaut de l'API (1) pour **tous** les appels, y compris si `LLM_MODEL`
  désigne un modèle plus ancien. Un réglage de température n'a jamais
  garanti des sorties identiques, mais le comportement change pour les
  fiches, la correction et le tuteur.
- **`SPLITTER_MAX_TOKENS` reste à 16 000**, avec son calcul recalé dans le
  code et dans `docs/modules/content.md` :
  - Le tokenizer de `claude-sonnet-5` compte environ 30 % de tokens en
    plus : j'ai pris 2,5 caractères par token, au lieu de 3.
  - La sortie estimée devient environ 10 400 tokens, soit une marge
    d'environ 1,55×. La sortie maximale de ce modèle est de 128K.
  - En réel, la plus grosse sortie a été de 5 809 tokens.
- **Variables Railway à ajouter** (je n'ai pas touché à Railway) :

  | Variable | Valeur | Obligatoire |
  |---|---|---|
  | `LLM_MODEL` | `claude-sonnet-5` | Non : c'est déjà le défaut du code. La poser explicitement permet de changer de modèle sans redéployer. |

  Rien d'autre ne change : `ANTHROPIC_API_KEY`, `SESSION_SECRET`,
  `DATA_DIR` et `COOKIE_SECURE` restent comme aujourd'hui. L'API et le
  worker tournent dans le même conteneur, une seule variable de service
  suffit.

### 2. Garde-fou sur la relance (`6083f45`)

- `retryNotionSplit` renvoie `has-notions` quand le document a déjà des
  notions, même si son dernier découpage a échoué. La route répond alors
  **409** `{ error: "has-notions" }` et n'enfile rien.
- Tests, vus rouges puis verts :
  - deux tests unitaires : notions présentes, et notions d'un autre
    document ou d'un autre utilisateur ignorées ;
  - un test d'intégration de la route, sur une vraie base SQLite.
- **Interface** :
  - Elle n'offrait déjà « Réessayer » que sans notions : le cas normal ne
    change pas.
  - Un 409 ne peut donc venir que d'un écran périmé (un autre onglet). Il
    n'affiche plus « Vérifie ta connexion », qui était faux dans ce cas :
    Mes cours et Notions rafraîchissent leurs données, et les notions
    apparaissent.
  - Deux tests d'écran couvrent ce cas, vus rouges puis verts.
- **Test existant modifié** : les six tests de
  `retry-notion-split.unit.test.ts` reçoivent la nouvelle dépendance
  obligatoire `notionRepo: fakeNotionRepository()` (vide). Leurs assertions
  ne changent pas.

### 3. Budget de notions par chunk (`d8fe5f9`)

- **`notionBudgets(longueurs, plafond)`** (`content/domain/notion-budget.ts`,
  fonction pure) partage le plafond du document entre les chunks, au
  prorata de leur longueur, par la méthode des plus forts restes.
  - Quand le plafond couvre tous les chunks, chacun reçoit d'abord 1 notion.
    Un budget de 0 demanderait au modèle de jeter le contenu du chunk.
  - Seul le reste est réparti au prorata.
  - **La somme vaut exactement le plafond, jamais plus.** En cas d'égalité
    des restes, le premier chunk l'emporte : le résultat est déterministe.
- **Prompt** : la ligne « Pour cette partie, ne produis jamais plus de N
  notions : le cours entier a une limite, partagée entre ses parties. »
  s'ajoute à la consigne existante « Vise entre X et Y notions… ».
- **La cible de 600 à 1 000 caractères est gardée**, et bornée par le
  budget : les deux consignes ne peuvent pas se contredire.
- **Pour A2A** : 9 budgets de 14 ou 15, total 131 ; cibles de 8 à 12 ou 13.
- **Tests** :
  - unitaires sur le calcul ;
  - handler : les budgets transmis somment au plafond, et la cible reste
    sous le budget ;
  - contrat : la phrase figure dans le prompt.
- **Mutation** : 11 mutations sur `notionBudgets` et sur la borne de la
  cible, toutes tuées.
  - Deux survivaient au premier essai. L'une était équivalente : la garde
    `count === 0` était redondante, je l'ai supprimée.
  - L'autre (réserver 1 même quand le plafond est inférieur au nombre de
    chunks) a été tuée par un test ajouté : `[1, 3]` avec un plafond de 1
    donne `[0, 1]`.

### 4. Passage réel de vérification

**Script** (`scratchpad/verify-run.mts`, hors dépôt) :

- Il suit le vrai chemin `handleSplitJob` → `ClaudeNotionSplitter` avec
  des dépôts en mémoire, sans écriture en base.
- Chaque chunk est ajouté à `chunks.jsonl` dès que le splitter répond,
  donc même si la validation du document échoue ensuite. Chaque ligne
  contient :
  - les appels, avec pour chacun `finishReason`, les tokens d'entrée et de
    sortie, la durée et la présence de réflexion ;
  - le nombre de notions ;
  - les notions complètes ;
  - le budget et la cible.
- **Garde-fou persistant** :
  - Un fichier compte la dépense de la mission, tous passages confondus.
  - Tout appel est refusé si le pire appel possible (9 000 tokens
    d'entrée et 16 000 de sortie, soit environ 0,18 $) pouvait faire
    dépasser 2 $.
- **Essai à blanc** (`DRY=1`, aucun réseau) avant de payer : il a vérifié
  la plomberie, les budgets et la présence des deux phrases dans le prompt.

**Estimation avant lancement : 0,40 à 0,70 $.**

- **Entrée** : environ 46 000 tokens, soit environ 0,09 $ à 2 $ le million.
  C'est le passage précédent (41 000 tokens) avec +30 % de tokenizer et
  moins de titres à éviter.
- **Sortie** : 30 000 à 60 000 tokens, soit 0,30 à 0,60 $ à 10 $ le
  million. Cela couvre environ 110 notions de 600 à 1 000 caractères, le
  JSON et une éventuelle réflexion adaptative.

**Résultat : succès du premier coup, sur `claude-sonnet-5`.** Pas de
second passage, et pas de repli sur `claude-sonnet-4-6`.

| Chunk | Car. | Budget | Cible | Notions | Appels | finishReason | Entrée | Sortie | Durée |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 7 314 | 15 | 8–13 | 10 | 1 | tool-calls | 4 155 | 3 498 | 31 s |
| 2 | 7 006 | 14 | 8–12 | 11 | 1 | tool-calls | 4 611 | 5 447 | 46 s |
| 3 | 7 535 | 15 | 8–13 | 14 | 1 | tool-calls | 4 844 | 5 455 | 50 s |
| 4 | 7 448 | 15 | 8–13 | 12 | 1 | tool-calls | 5 017 | 5 767 | 54 s |
| 5 | 7 270 | 15 | 8–13 | 13 | 1 | tool-calls | 5 128 | 4 187 | 36 s |
| 6 | 7 037 | 14 | 8–12 | 10 | 1 | tool-calls | 5 372 | 4 625 | 41 s |
| 7 | 7 163 | 14 | 8–12 | 14 | 1 | tool-calls | 5 542 | 5 809 | 53 s |
| 8 | 7 017 | 14 | 8–12 | 13 | 1 | tool-calls | 5 678 | 4 664 | 43 s |
| 9 | 7 593 | 15 | 8–13 | 14 | 2 | tool-calls ×2 | 12 733 | 10 429 | 97 s |
| **Total** | **65 383** | **131** | | **111** | **10** | | **53 080** | **49 881** | **451 s** |

- **Nombre de notions : 111**, sous le plafond de 131. Le document est
  validé et écrit. Au passage précédent, sans guidage, il y en avait 315.
- **Budgets** : aucun chunk ne dépasse le sien. Quatre chunks (3, 7, 8 et
  9) dépassent la cible haute d'une ou deux notions, sans jamais dépasser
  leur budget. Aucun chunk n'est sous la cible basse.
- **Longueur des corps de notion** :
  - minimum 321, p10 557, p25 627, médiane 826, p75 987, p90 1 199,
    maximum 1 972 caractères ; moyenne 855.
  - Répartition : 21 entre 300 et 599, **64 entre 600 et 999**, 22 entre
    1 000 et 1 499, 4 à 1 500 ou plus. Aucune sous 300.
- **Difficulté** : 24 faciles, 73 moyennes, 14 difficiles.
- **Doublons résolus : 0.** Aucun titre n'a été répété, même en ignorant la
  casse : le filet `disambiguateTitles` n'a rien eu à renommer.
  `avoidTitles` a suffi.
- **Coût réel : 0,605 $** (53 080 × 2 $ + 49 881 × 10 $ par million).
  C'est dans l'estimation. **Dépense totale de la mission : 0,605 $ sur
  2 $.**
- **Durée : 7 min 31 s**, contre 14 min 19 s au passage précédent. Chaque
  chunk prend environ 45 s au lieu d'environ 95 s.
- **Réflexion** : aucun bloc de réflexion n'est revenu sur les 10 appels.
  Les 49 881 tokens de sortie restent cohérents avec le seul texte produit :
  environ 95 000 caractères de corps plus les titres et le JSON, soit
  environ 2 caractères par token. Je ne peux pas exclure une petite part de
  réflexion non restituée.
- **Une relance pour erreur de schéma, sur le chunk 9.** Le premier appel a
  bien rendu un appel d'outil, mais la sortie ne passait pas la validation.
  La relance unique avec retour d'erreur a réussi. **Mon script
  n'enregistrait pas le message de validation**, donc je ne peux pas dire
  quelle règle a échoué (longueur de titre, champ manquant ou énumération).
  Coût de cette relance : environ 0,07 $.

**5 notions tirées au hasard** (graine 694671, positions 1, 21, 23, 61 et
94 sur 0 à 110), en entier :

> **1 — Exécution opaque (principe fondateur d'A2A)** · moyenne · 564 car.
>
> Le principe fondateur d'A2A est l'**exécution opaque** : un agent collabore avec un autre uniquement sur la base des capacités qu'il déclare (via son Agent Card) et des informations explicitement échangées (messages, tâches, artifacts).
>
> Un agent ne partage jamais :
> - sa mémoire interne,
> - ses outils,
> - ses prompts,
> - son plan d'exécution interne.
>
> C'est précisément ce qui distingue A2A d'un simple appel d'outil (comme dans MCP) : l'agent distant reste une « boîte noire » du point de vue du client, on interagit avec lui uniquement via l'interface normalisée.

> **21 — États terminaux d'une Task (succès, échec, annulation, rejet)** · moyenne · 627 car.
>
> Une Task se termine dans l'un de ces états, et n'en change plus jamais ensuite :
>
> - **TASK_STATE_COMPLETED** : succès, les artifacts finaux sont disponibles.
> - **TASK_STATE_FAILED** : échec définitif.
> - **TASK_STATE_CANCELED** : annulée avant d'avoir abouti (typiquement à la demande du client).
> - **TASK_STATE_REJECTED** : l'agent refuse de traiter la tâche, soit dès la réception, soit en cours de traitement.
>
> Ces quatre états sont dits *terminaux* car ils ferment définitivement le cycle de vie de la tâche : plus aucune mise à jour de statut ne suivra, et un flux de streaming se ferme dès qu'un état terminal est atteint.

> **23 — Trois mécanismes de suivi d'une tâche** · moyenne · 784 car.
>
> A2A propose trois façons de suivre l'avancement d'une tâche, avec des compromis différents :
>
> | Mécanisme | Opérations | Latence | Contrainte client | Cas d'usage idéal |
> |---|---|---|---|---|
> | **Polling** | `GetTask` en boucle | Élevée | Aucune contrainte particulière | Intégrations simples, pare-feu restrictifs |
> | **Streaming** | `SendStreamingMessage`, `SubscribeToTask` | Faible | Maintenir une connexion ouverte | UI interactives, suivi temps réel |
> | **Push (webhook)** | `CreateTaskPushNotificationConfig` ou config dans `SendMessage` | Moyenne | Exposer un endpoint HTTPS joignable | Tâches longues, serveur à serveur, architectures événementielles |
>
> Le choix dépend du contexte réseau du client, de la durée attendue de la tâche et du besoin de réactivité en temps réel.

> **61 — Menaces A2A : confused deputy et déni de service** · moyenne · 933 car.
>
> Deux autres menaces spécifiques à A2A, complémentaires à l'injection de prompt et à l'exfiltration par délégation :
>
> - **« Confused deputy » et escalade de privilèges** : un agent intermédiaire dans une chaîne de délégation réutilise un jeton d'authentification trop large (portée excessive) pour agir en aval avec plus de droits que nécessaire. Contre-mesure principale : utiliser des jetons à portée réduite pour chaque saut de la chaîne, via un mécanisme d'échange de jetons (token exchange, RFC 8693), avec une audience restreinte (le jeton n'est valide que pour le destinataire prévu) et une durée de vie courte.
>
> - **Déni de service** : des tâches longues ou des flux de streaming ouverts en masse peuvent saturer un agent serveur. Contre-mesures : imposer des quotas par client, limiter le nombre de tâches concurrentes autorisées, fixer des timeouts, et utiliser l'en-tête Retry-After pour indiquer au client quand réessayer.

> **94 — Bonnes pratiques côté client et orchestrateur** · moyenne · 1 044 car.
>
> Pratiques recommandées pour un client ou un orchestrateur A2A :
>
> - Lire systématiquement l'Agent Card et vérifier les capacités et la version avant d'appeler un agent ; mettre la carte en cache avec revalidation plutôt que de la relire à chaque appel.
> - Implémenter timeouts, retries et disjoncteurs (circuit breakers) : le protocole A2A laisse explicitement ces mécanismes à la charge du client.
> - Définir un **budget de délégation** : profondeur maximale de chaîne de délégation, nombre maximal d'agents appelés pour une même requête, plafond de coût par requête utilisateur — afin d'éviter les boucles infinies et les explosions de coûts (notamment pertinent dans un pattern de délégation hiérarchique ou de maillage pair à pair).
> - Traiter toute sortie provenant d'un agent tiers comme une entrée non fiable, au même titre qu'une entrée utilisateur, en raison du risque d'injection de prompt.
> - Reprendre après une coupure réseau via `SubscribeToTask` ou `GetTask`, jamais en relançant la demande depuis zéro (ce qui créerait des doublons).

Ce que je remarque, sans me substituer à ton jugement :

- Les corps sont autonomes et gardent les tableaux en Markdown.
- Les titres de la notion 61 et de sa voisine (« Menaces A2A : injection de
  prompt… ») se répondent : `avoidTitles` a poussé vers des titres plus
  précis plutôt que vers des doublons.
- La notion 61 renvoie à « l'injection de prompt et l'exfiltration »
  (« complémentaires à… ») : elle suppose que l'étudiant a lu la notion
  voisine.

### 5. Vérification mobile (`ce4b06e`, `419dd90`, `7274d61`, `00b1895`)

- **`e2e/notion-step-mobile.spec.ts`**, en 375×812 (surcharge de viewport
  dans la spec, selon les conventions responsive de M10). Deux scénarios :
  un pour Mes cours, un pour Notions. Chacun parcourt « en cours », puis
  « échec avec Réessayer », puis « prêt ».
- **À chaque état** :
  - pas de défilement horizontal (`scrollWidth` ≤ 375) ;
  - « Réessayer » fait au moins 44 px de haut et tient dans la largeur ;
  - rien ne le recouvre à son centre ;
  - une capture est prise, animations figées.
- **« En cours »** : le découpage de fixture finit en moins d'une seconde.
  La route de statut est donc interceptée pour ce seul cours, et elle
  renvoie `pending` ; les autres cours passent tels quels.
- **« Échec » et « prêt »** passent par le vrai serveur : échec terminal
  forcé en base, comme dans `notion-split-failure.spec.ts`, puis vrai clic
  sur « Réessayer ».
- **Non-vacuité**, chaque fois rouge aux bonnes lignes puis code restauré :
  - un élément de 600 px forcé dans l'état « en cours » des deux écrans,
    puis dans l'état « échec » seul (`scrollWidth` 633 et 488) ;
  - le bouton aligné sur le bas de l'écran, sous la barre de navigation.
- **Ce que les captures ont révélé** :
  - **Corrigé** : sur Notions, le « : » de « Ton cours est bien lu : tu
    peux… » ouvrait une ligne. Il y a maintenant une espace insécable avant
    les deux-points, dans ce seul message, avec un test d'écran vu rouge
    puis vert. L'app n'a pas de convention générale pour ça : voir
    « Ce qui reste ouvert ».
  - **Corrigé dans la spec** : `scrollIntoViewIfNeeded()` comptait comme
    visible un « Réessayer » caché sous la barre de navigation fixe, et une
    capture le montrait ainsi. Le bouton est maintenant centré, et la spec
    vérifie qu'il est bien l'élément touché à son centre. Dans l'app, le
    bouton reste atteignable en faisant défiler, grâce à la réserve `pb-16`
    du shell.
  - **Fausse alerte** : une capture montrait les pastilles de cours
    délavées. C'était une transition saisie en cours de route, disparue
    avec `animations: "disabled"`.
  - **Non corrigé, antérieur à la mission** : dans la carte de résumé de
    l'écran Notions, « 5 notions · 0 maîtrisée · 0 à réviser » se casse mal
    à 375 px. Un « · » reste isolé et « 0 à réviser » passe sur deux lignes
    (capture « Prêt » ci-dessous). Avec « 0 notion », la ligne tient.
- **Mon erreur, corrigée** (`419dd90`) : mes premiers titres de cours
  (« Notions mobile Mes cours ») contenaient des noms d'écran. Sur le
  compte e2e partagé, cela a cassé les recherches `heading "Mes cours"`
  d'autres specs : 3 échecs directs, et 4 specs pomodoro en cascade
  derrière une session restée ouverte. Les titres sont maintenant neutres,
  avec un commentaire qui explique pourquoi.
- Les helpers de `notion-split-failure.spec.ts` sont recopiés plutôt que
  déplacés, pour ne pas modifier cette spec existante.

Captures à 375 px (`docs/reports/long-documents-notions/`) :

| | Mes cours | Notions |
|---|---|---|
| En cours | ![](long-documents-notions/mes-cours-en-cours.png) | ![](long-documents-notions/notions-en-cours.png) |
| Échec avec Réessayer | ![](long-documents-notions/mes-cours-echec.png) | ![](long-documents-notions/notions-echec.png) |
| Prêt | ![](long-documents-notions/mes-cours-pret.png) | ![](long-documents-notions/notions-pret.png) |

### Vérifications finales

- `pnpm test` : 202 fichiers, 1 488 tests, verts (1 463 au début de cette
  mission).
- `pnpm typecheck` et `pnpm lint` (eslint et dependency-cruiser) : verts.
- **Playwright** : 57/57 sur l'état final (`CI=1 --retries=0`, 4,7 min).
- **Aucun test existant supprimé.** Tests existants modifiés :
  - les six tests de `retry-notion-split.unit.test.ts`, par l'ajout d'une
    dépendance, assertions inchangées (point 2).
  - Tous les autres changements de tests sont des ajouts : nouveaux tests
    dans des fichiers existants, ou nouveaux fichiers.
- **Dépense payante de la mission : 0,605 $ sur 2 *, en un seul passage.

## Ce qui reste ouvert

Mis à jour à la fin de la seconde mission (voir « Suite du 2026-09-27 »).
La vérification réelle de la granularité, le modèle par défaut et la
vérification à 375 px sont faits, et ne figurent plus ici.

- **Les autres appels au modèle passent aussi à `claude-sonnet-5`, sans
  vérification réelle.** Seul le découpage en notions a tourné sur ce
  modèle. Sont concernés :
  - l'extraction de photo (vision) ;
  - la génération de fiches ;
  - la correction des réponses ;
  - le tuteur ;
  - l'extraction de todo.
  
  Deux risques, que je n'ai pas mesurés :
  - **Troncature.** Ces adaptateurs gardent la sortie par défaut du
    provider (4 096 tokens), et le nouveau tokenizer compte environ 30 % de
    tokens en plus pour le même texte. Une réponse qui tenait de justesse
    peut désormais être coupée.
  - **Température.** Elle passe de 0 à 1 pour tous ces appels.
  
  `pnpm eval` (payant, manuel) couvre les fiches, le splitter et le tuteur :
  à lancer avant de déployer, avec ton accord.
- **Déploiement** : branche non poussée. Au déploiement, ajouter la
  variable Railway `LLM_MODEL=claude-sonnet-5`. Elle est facultative : le
  code prend déjà ce défaut.
- **Relance pour erreur de schéma sur le chunk 9 du passage réel, cause
  inconnue.** Mon script n'enregistrait pas le message de validation. Le
  splitter lui-même ne journalise la raison d'un premier échec nulle part,
  sauf si la relance échoue aussi (`lastError`). À ajouter si on veut
  suivre ce taux.
- **À dégeler dans `jobs`** :
  - Laisser l'erreur d'un handler porter un indicateur « terminal », par
    exemple `JobError = string | { message; terminal? }`, et faire passer
    `{ terminal }` à `fail()` par `runWorkerTick`.
  - Corriger aussi la phrase « exactly one caller » de
    `docs/modules/jobs.md`.
  - Ensuite, supprimer `apps/worker/src/terminal-failures.ts`.
- **Nettoyages possibles** :
  - `chunkByTopLevelHeadings` et ses tests ne sont plus utilisés en
    production (ils sont marqués « superseded »).
  - La relance avec retour d'erreur du splitter se déclenche aussi sur une
    erreur réseau, ce qui ne sert à rien puisque le SDK a déjà relancé.
  - Les helpers de `e2e/notion-split-failure.spec.ts` sont maintenant
    recopiés dans `e2e/notion-step-mobile.spec.ts` : ils pourraient aller
    dans `e2e/support/`.
- **Trouvés par les captures à 375 px, non corrigés** :
  - Dans la carte de résumé de l'écran Notions, « 5 notions · 0 maîtrisée ·
    0 à réviser » se casse mal : un « · » reste isolé et « 0 à réviser »
    passe sur deux lignes. Le défaut est antérieur à la mission (écran
    adapté en M10 Phase 1). Voir la capture « Prêt ».
  - Aucune convention d'espace insécable avant « : », « ? », « ! » et « ; »
    dans les textes de l'UI. Seul le message d'échec des notions est
    corrigé. Faut-il une règle dans `docs/UI.md` ?
- **Non fait** :
  - Le code d'un PDF n'est jamais clôturé, donc il n'est pas protégé du
    découpage.
  - `listNotionStatuses` relit tous les jobs `split-notions` de
    l'utilisateur à chaque requête : sans effet aujourd'hui, mais ce volume
    grandit avec le temps.
- **Questions produit nouvelles** :
  - Quatre chunks sur neuf dépassent la cible haute d'une ou deux notions,
    tout en restant sous leur budget. Faut-il resserrer la cible, ou
    accepter ce dépassement ?
  - Certaines notions renvoient à leur voisine (la notion 61 dit
    « complémentaires à l'injection de prompt… »). Faut-il exiger des
    notions strictement autonomes dans le prompt ?
  - Un cours dont le dernier découpage a échoué mais qui a déjà des notions
    ne peut plus être redécoupé, ni depuis l'UI ni par l'API. C'est voulu,
    pour protéger les fiches et l'historique de révision, mais il n'existe
    aucun chemin pour « tout refaire ».
- **Hors milestone** : il s'agit de la correction d'une fonctionnalité M2/M3
  existante, faite sur ta demande explicite. Je n'ai pas touché à
  `docs/MILESTONES.md`.
- Le PDF A2A reste non suivi à la racine du dépôt. Sa copie est commitée
  comme fixture (1,5 Mo).

## Questions produit tranchées à ta place (à relire)

1. **Granularité** : je garde « une notion pour 500 caractères au plus
   fin » et je guide le modèle vers 600 à 1 000. L'autre option était
   d'accepter la granularité naturelle du modèle (~208 caractères par
   notion) en montant le plafond à environ `longueur / 150`, ce qui donne
   315 notions pour A2A.
2. **Dépassement du plafond terminal** : une relance manuelle depuis l'UI
   reste possible, mais coûte environ 0,80 $ à chaque fois.
3. **Texte d'échec**, identique sur les deux écrans : « Les notions de ce
   cours n'ont pas pu être créées. Ton cours est bien lu : tu peux relancer
   la création. » Il ne distingue pas la troncature ou le dépassement d'une
   panne passagère. Si la relance elle-même échoue : « Impossible de
   relancer la création des notions. Vérifie ta connexion et réessaie. »
4. **En cours** : Mes cours affiche « Création des notions… » ; Notions
   affiche « Création des notions en cours… Elles apparaîtront ici dès
   qu'elles seront prêtes. »
5. **Notions déjà présentes mais dernier découpage en échec** : les notions
   s'affichent sans « Réessayer », parce qu'une relance les remplacerait,
   elles et leurs fiches. Cette garde n'existe que dans l'UI : la route
   serveur accepte encore cette relance.
6. **Codes HTTP** : 409 pour une relance alors que l'étape n'a pas échoué,
   403 pour le document d'un autre utilisateur ou inconnu.
7. **En-tête courant** : ligne de plusieurs mots présente sur au moins 40 %
   des pages estimées (3 fois au minimum). Sans pagination, rien n'est
   supprimé.
8. **Format de désambiguïsation** : `Titre (Section)`, puis
   `Titre (partie N)`, puis `Titre (Section 2)`.
9. **Taille des chunks** : cible de 10 000 caractères, maximum de 15 000,
   titre préféré à partir de 70 % de la cible.
10. **Statut indisponible sur Mes cours** : si la route de statut échoue,
    les cartes retombent sur l'affichage d'extraction seul, sans état
    d'erreur.
