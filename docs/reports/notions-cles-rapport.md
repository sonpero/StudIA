# Rapport — notions clés et budget de cartes (M11)

Branche `feat/key-notions-card-budget`, non poussée, rien de déployé.
Journal des décisions : `notions-cles-decisions.md`. Conception :
`notions-cles-conception.md`.

## 1. Critères d'acceptation

| Critère | État | Preuve |
|---|---|---|
| Volume dans les bornes pour les trois tailles | **Garanti en code pour le plafond, non mesuré sur le modèle réel** | `card-budget.unit.test.ts`, `key-notion-plan.unit.test.ts`, `handle-course-generation-job.unit.test.ts` (« caps the key notions… »). L'eval payante est bloquée (crédit API épuisé, D14) |
| Couverture de toutes les sections | **Garanti en code pour les parties déclarées par le modèle, non mesuré contre la référence écrite à la main** | `claude-key-notion-extractor.contract.test.ts` (partie sans notion clé → relance, puis échec), `capKeyNotions` garde une notion par partie. La vérité de terrain de l'eval n'a pas tourné |
| Aucun doublon de notion clé | **Garanti en code pour les titres identiques après normalisation ; quasi-doublons non mesurés** | `dedupeKeyNotions`, tests unitaires et mutations. Limite : D13 |
| Cours existants intacts | **Fait** | Migration 0013 additive, rejeu depuis 0012 avec carte, planning et révision inchangés (vérifié par mutation). Le job refuse définitivement un cours qui a des cartes, sans aucun appel au modèle. La route répond 409 `has-cards` |
| Eval avec chiffres avant / après | **Écrite et validée à blanc, pas exécutée** | `evals/run-key-notions.eval.test.ts`, bloquée par le solde de crédits API (D14) |
| Playwright : créer les fiches d'un cours puis en réviser une | **Fait** | `e2e/course-cards.spec.ts`, observé rouge puis vert. Suite complète : 58/58 |

## 2. Chiffres de l'eval

Pas de chiffres réels : le premier appel payant a été refusé avec « Your
credit balance is too low to access the Anthropic API ». Dépense de la
mission : 0 $.

La référence « avant » se calcule déjà sans le modèle, avec la formule du
diagnostic et le budget « après » de ce lot :

| Cours | Car. | Pages | Avant (formule, 3 types) | Après, bornes du budget (flashcards / QCM / libres) | Après, maximum total |
|---|---|---|---|---|---|
| A2A ch. 1–2 | 8 173 | 5,4 | environ 14 notions de lecture × 10,5 ≈ 147 (42 à 210) | 16–26 / 6–10 / 2–4 | 40 |
| A2A ch. 1–6 | 36 248 | 24,2 | environ 61 × 10,5 ≈ 641 (183 à 915) | 39–59 / 19–29 / 8–12 | 100 |
| Révolution française | 100 174 | 66,8 | environ 170 × 10,5 ≈ 1 785 (510 à 2 550) | 70–90 / 35–45 / 12–15 | 150 |

Le nombre de notions de lecture « avant » est estimé à la densité d'A2A
(une notion pour environ 590 caractères, diagnostic du 2026-10-03). L'eval
mesurera le nombre réel.

Coût estimé du passage complet : environ 2 à 3 $.

| Phase | Appels pour un cours de 25 pages | Coût estimé |
|---|---|---|
| Découpage | inchangé, environ 4 | environ 0,35 $ |
| Notions clés | 1 | environ 0,10 $ |
| Génération | environ 10 (4 lots de flashcards, 3 de QCM, 2 de questions libres), au lieu d'environ 180 appels | environ 0,20 $ |

## 3. Décisions à relire en priorité

- **D2** : les sections viennent du modèle.
- **D6** : libellé « Créer les fiches ».
- **D7** : l'ancien flux reste côté API.
- **D8** : règle « position » ajoutée, elle n'existait pas.
- **D9** : écart TDD sur le handler.
- **D15** : tests existants modifiés pour retirer l'ancienne interface.
- **D14** : sources de l'eval et blocage.

## 4. Points ouverts

- **Règle de maîtrise** (stabilité ≥ 21 jours et 3 répétitions par carte,
  `review/domain/mastery.ts`), à rediscuter séparément. Avec environ 100
  cartes au lieu d'environ 1 000, la progression d'un cours devient
  atteignable, mais elle compte toujours des cartes et non des notions
  clés. Une notion clé à trois cartes pèse trois fois plus qu'une notion
  clé à une seule.
- **Citation multi-sources** : une carte ne pointe que vers sa première
  notion de lecture (D11). Les autres sources sont stockées
  (`key_notion_sources`) mais ne sont pas encore affichées dans le Lecteur.
- **Suppression de l'ancien flux** (D7) : elle attend ton accord, puisqu'il
  faudrait supprimer les tests associés.
- **Quasi-doublons sémantiques** entre notions clés (D13) : ils ne sont
  détectés que par le prompt, puis mesurés par l'eval.
- **Le Tuteur n'a aucune limite de longueur de cours** (D5), un risque
  existant non traité ici.

## 5. Ce qu'impliquerait un bouton « Régénérer » (non implémenté)

- **Historique** : les cartes d'un cours régénéré sont nouvelles. Leurs
  identifiants changent, donc leur historique de révision repart de zéro,
  sauf correspondance.
  - `diffCards` sait conserver une carte dont la question est inchangée à
    l'identique, mais un modèle reformule presque toujours.
  - En pratique, régénérer efface l'historique de la plupart des cartes.
- **Ce qu'il faudrait** :
  1. **Choisir ce qui est régénéré** :
     - seulement les cartes jamais révisées, en gardant celles qui ont un
       historique ;
     - ou tout, avec un avertissement explicite (« tes révisions de ce
       cours repartiront de zéro »).
  2. **Garder ou refaire les notions clés** : les refaire coûte un appel
     d'extraction et change la liste. Les garder ne refait que les lots
     (moins de 0,5 $ pour 25 pages).
  3. **Supprimer les anciennes cartes dans la même transaction** que
     l'écriture des nouvelles. La suppression cascade sur les révisions,
     de façon irréversible : c'est le point qui demande ta décision.
  4. **Lever le refus du job** pour un cours qui a des cartes. Il protège
     aujourd'hui les cours existants, et la route renvoie `has-cards`.
     Il faudrait un paramètre explicite, jamais un comportement par
     défaut.
  5. **Pour un cours de l'ancien flux** (1 000 cartes et plus), proposer
     une migration :
     - garder les cartes révisées au moins une fois ;
     - ne générer que les notions clés qu'elles ne couvrent pas.

     C'est plus complexe, car il faut rattacher les anciennes cartes à des
     notions clés.
