# Rapport — notions des documents longs et échecs visibles

Branche `fix/long-documents-notions` (depuis `cad3dca`), non poussée.
Mission du 2026-09-27. Document de référence : le PDF de 43 pages
« Cours complet le protocole Agent2Agent (A2A) ».

## En bref

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
- **Correctif ajouté après le passage réel, non vérifié en réel.** Le prompt
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

## Ce qui reste ouvert

- **Vérifier la cible de granularité en réel** : un passage sur A2A, environ
  0,80 $. Il faut cette fois capturer les notions même en cas d'échec, pour
  pouvoir juger leur qualité.
- **À dégeler dans `jobs`** : laisser l'erreur d'un handler porter un
  indicateur « terminal », par exemple
  `JobError = string | { message; terminal? }`, et faire passer
  `{ terminal }` à `fail()` par `runWorkerTick`. Il faudrait aussi corriger
  la phrase « exactly one caller » de `docs/modules/jobs.md`. Ensuite, on
  supprime `apps/worker/src/terminal-failures.ts`.
- **Modèle par défaut** : `claude-sonnet-4-5` est au statut « Legacy », avec
  un retrait « not sooner than 2026-09-29 », soit dans deux jours. Il est
  fixé dans `shared/model-client.ts`, qui est gelé : je n'y ai pas touché.
  C'est probablement le point le plus urgent.
- **Nettoyages possibles** :
  - `chunkByTopLevelHeadings` et ses tests ne sont plus utilisés en
    production (ils sont marqués « superseded »).
  - La relance avec retour d'erreur du splitter se déclenche aussi sur une
    erreur réseau, ce qui ne sert à rien puisque le SDK a déjà relancé.
- **Non fait** :
  - Vérification à 375 px des nouveaux états de Mes cours et Notions.
  - Le code d'un PDF n'est jamais clôturé, donc il n'est pas protégé du
    découpage.
  - `listNotionStatuses` relit tous les jobs `split-notions` de
    l'utilisateur à chaque requête : sans effet aujourd'hui, mais ce volume
    grandit avec le temps.
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
