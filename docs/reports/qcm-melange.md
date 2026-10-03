# Rapport — mélange des options de QCM à l'affichage

Branche `fix/qcm-shuffle-display`, poussée, non fusionnée, rien de déployé.
Aucun appel payant : toutes les réponses du modèle sont simulées (fixtures).

## 1. Cause exacte

Le chemin d'une option de QCM, avant le correctif :

1. **Génération.**
   - **QCM d'avant M11** : l'ancien générateur, supprimé depuis
     (`claude-card-generator.ts`, commit `becae42`), stockait les options
     dans l'ordre rendu par le modèle, qui place presque toujours la bonne
     réponse en premier. Aucun mélange.
   - **QCM du nouveau flux** :
     `packages/core/src/generation/application/handle-course-generation-job.ts:143`
     les mélangeait **une seule fois, avant l'écriture** :
     `options: planned.options ? shuffleOptions(planned.options, planned.question) : null`.
     La graine est la question elle-même (`mcq-invariants.ts`, FNV-1a puis
     mulberry32). Chaque carte avait donc une position fixe, différente
     d'une carte à l'autre, mais identique à chaque révision.
2. **Stockage** : `cards.options_json`, tel quel.
3. **API** : `packages/core/src/review/infra/sqlite-review-repository.ts:51`
   relit `JSON.parse(row.optionsJson)` sans réordonner. La route de session
   le renvoie tel quel.
4. **Client** : `apps/web/src/screens/ReviewScreen.tsx:237` affichait
   `current.options.map(...)` dans l'ordre reçu. Aucun tri, aucun
   réordonnancement.

**Conclusion** : la bonne réponse s'affichait toujours en première position
pour **tous les QCM créés avant M11**, puisque rien sur le chemin ne les
mélange. Pour les QCM du nouveau flux, elle restait toujours **à la même
place**, ce qu'un élève finit par retenir.

Les hypothèses vérifiées :

| Hypothèse | Verdict |
|---|---|
| Mélange appliqué seulement à la génération, QCM d'avant M11 non concernés | **Oui**, c'est la cause principale |
| Mélange dans le domaine mais pas branché sur l'écran | **Oui** : son seul appelant est le job de génération, l'écran n'en a jamais eu |
| Le client réordonne après coup | Non : il affiche l'ordre reçu |
| Mélange neutralisé (graine constante, cache) | **En partie** : la graine est constante par question, ce qui est voulu par D8, donc chaque carte garde sa position pour toujours. Il n'y a pas de cache en cause |
| Commit de D8 absent de main | Non : `4763b34` est dans `main` |

Je n'ai pas accès à la production. Le constat (« toujours en première
position ») correspond aux QCM d'avant M11, qu'un déploiement de M11
n'aurait de toute façon pas mélangés.

## 2. Pourquoi l'eval de M11 ne l'a pas vu

`evals/run-key-notions.eval.test.ts` lisait `options_json` dans la base de
l'eval, donc l'ordre **stocké**, et seulement pour des QCM **fraîchement
générés par le nouveau flux**. Elle mesurait la répartition entre cartes
différentes (21 / 25 / 16 / 19 sur 81 QCM), qui était bien uniforme.

Elle ne mesurait ni :
- l'écran ;
- la même carte présentée plusieurs fois ;
- les QCM d'avant M11.

C'était un test du domaine présenté comme une propriété de l'affichage.
L'eval indique désormais quelle couche elle mesure : la colonne est
renommée « position dans l'ordre stocké », avec une phrase qui renvoie au
test Playwright pour l'ordre affiché.

## 3. Correctif et tests

**Correctif** :
- Le mélange se fait côté affichage, à chaque présentation d'une carte :
  `apps/web/src/screens/ReviewScreen.tsx`.
  - `useMemo` sur la carte présentée, donc un nouvel ordre à chaque
    session et à chaque nouvelle carte ;
  - jamais de remélange pendant que l'élève répond.
- Il utilise `shuffle` (`apps/web/src/lib/shuffle.ts`) : Fisher-Yates,
  fonction pure, générateur aléatoire injectable (par défaut
  `Math.random`).
- **Un seul point de vérité** :
  - `shuffleOptions` et son appel dans le job de génération sont
    supprimés ;
  - les options sont stockées dans l'ordre généré ;
  - le test du handler « shuffles MCQ options deterministically » devient
    « stores MCQ options in the order generated » ;
  - les tests de `shuffleOptions` sont supprimés avec la fonction.
- **Notation** : elle reposait déjà sur l'identifiant de l'option, jamais
  sur sa position. Le serveur compare le **texte** choisi au texte de la
  bonne réponse (`review/domain/grade-mcq.ts`, égalité exacte).
  - Ce texte sert d'identifiant : il est unique dans une carte, grâce à
    l'invariant `areOptionsDistinct` vérifié à la génération dans les deux
    flux.
  - Décision : pas d'identifiant numérique en plus. Il aurait fallu
    modifier les données, ce qui est exclu.
- Aucune migration, aucune donnée modifiée.

**Tests ajoutés** :
- `apps/web/src/lib/shuffle.unit.test.ts`, observés rouges (module absent)
  puis verts :
  - toutes les options sont conservées, la bonne réponse exactement une
    fois, et l'entrée n'est pas modifiée ;
  - Fisher-Yates est piloté par le générateur injecté ;
  - sur 10 000 tirages avec un générateur à graine, chaque position reçoit
    la bonne réponse entre 23 % et 27 % des cas ;
  - liste vide et liste à un élément.
  - Mutation : la variante biaisée classique (`random() * i`) fait échouer
    2 tests.
- `e2e/mcq-shuffle-display.spec.ts`, deux cas, chacun présenté 20 fois à
  l'écran puis répondu juste :
  - un QCM stocké avec la bonne réponse en position 0, comme avant M11,
    inséré directement dans la base e2e ;
  - un QCM généré par le nouveau flux, à partir des réponses simulées du
    générateur fixture.
- **Vu rouge sur le code d'avant le correctif** :
  - ancien QCM : positions « 0,0,0,…,0 » (20 fois la première place) ;
  - nouveau QCM : « 1,1,1,…,1 » (la position fixée par la graine).
- **Vu vert après le correctif** : la position varie au fil des 20
  présentations, et le choix de la bonne réponse est noté « Correct. »
  dans les deux cas.

**Prévention** :
- règle ajoutée dans `CLAUDE.md`, section UI ;
- note de correction dans `docs/reports/notions-cles-rapport.md` ;
- `docs/modules/generation.md` mis à jour.

## 4. Anciens QCM couverts sans migration

Le mélange s'applique à l'affichage, à ce que renvoie l'API, quel que soit
l'ordre stocké. Les QCM d'avant M11, réponse en premier, sont donc mélangés
à chaque présentation sans qu'aucune ligne ne soit modifiée. C'est
exactement le premier cas du test Playwright : un QCM stocké réponse en
premier, inséré tel quel dans la base.
