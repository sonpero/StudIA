import { describe, expect, it } from "vitest";
import { splitIntoParagraphs, splitIntoSections } from "./split-into-sections.js";

describe("splitIntoParagraphs", () => {
  it("returns nothing for empty or blank markdown", () => {
    expect(splitIntoParagraphs("")).toEqual([]);
    expect(splitIntoParagraphs("   \n\n  ")).toEqual([]);
  });

  it("splits on blank lines and trims each paragraph", () => {
    expect(splitIntoParagraphs("# Titre\n\nCorps un.\n\nCorps deux.")).toEqual(["# Titre", "Corps un.", "Corps deux."]);
  });
});

describe("splitIntoSections", () => {
  it("returns nothing for empty markdown", () => {
    expect(splitIntoSections("")).toEqual([]);
  });

  it("keeps a paragraph as its own section when it already meets minSize", () => {
    const long = "Un paragraphe de cours suffisamment long pour ne jamais être fusionné avec un voisin, largement.";
    expect(splitIntoSections(long, 80)).toEqual([long]);
  });

  it("merges a heading-only fragment forward into the body paragraph that follows it", () => {
    const markdown = "## Définition\n\nLa photosynthèse est le processus biologique par lequel les plantes convertissent la lumière en énergie chimique.";
    const sections = splitIntoSections(markdown, 80);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toBe(
      "## Définition\n\nLa photosynthèse est le processus biologique par lequel les plantes convertissent la lumière en énergie chimique.",
    );
  });

  it("merges a chain of consecutive undersized fragments forward until one is long enough", () => {
    const markdown = "# A\n\n## B\n\nUn paragraphe de cours suffisamment long pour ne jamais être fusionné avec un voisin, largement.";
    const sections = splitIntoSections(markdown, 80);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toBe(markdown);
  });

  it("merges a trailing undersized fragment backward when it is last and alone", () => {
    const first = "Un premier paragraphe de cours suffisamment long pour ne jamais être fusionné, largement au-delà du seuil.";
    const second = "Un second paragraphe de cours suffisamment long pour ne jamais être fusionné, largement au-delà du seuil.";
    const tail = "Fin.";
    const sections = splitIntoSections(`${first}\n\n${second}\n\n${tail}`, 80);
    expect(sections).toEqual([first, `${second}\n\n${tail}`]);
  });

  it("falls back to a single section when every paragraph in the document is undersized", () => {
    expect(splitIntoSections("# A\n\n## B", 80)).toEqual(["# A\n\n## B"]);
  });

  it("a custom minSize changes where fragments merge", () => {
    const a = "Paragraphe de cent caractères environ, ni trop court ni trop long pour ce test précis ici.";
    const b = "Un second paragraphe, de longueur comparable au premier, pour vérifier le seuil personnalisé choisi.";
    expect(splitIntoSections(`${a}\n\n${b}`, 10)).toEqual([a, b]);
    expect(splitIntoSections(`${a}\n\n${b}`, 1000)).toEqual([`${a}\n\n${b}`]);
  });

  it("is deterministic: the same markdown always yields the same sections", () => {
    const markdown = "# Titre\n\n## Sous-titre\n\nUn paragraphe de cours suffisamment long pour ne jamais être fusionné avec un voisin, largement.\n\nCourt.";
    expect(splitIntoSections(markdown)).toEqual(splitIntoSections(markdown));
  });
});

// Real course material, mirroring evals/golden/*/input.md verbatim (a copy,
// not a file read: domain unit tests are pure, no I/O -- see docs/TESTING.md).
// Counts measured directly against these five documents while cadring M8;
// see docs/modules/tutor.md's Domain section for the same table. A change to
// the splitting or merge rule that shifts these numbers is exactly the
// regression a synthetic case alone would not catch.

const SVT_PHOTOSYNTHESE = `# La photosynthèse

## Définition

La photosynthèse est le processus biologique par lequel les plantes, les algues
et certaines bactéries convertissent l'énergie lumineuse en énergie chimique,
stockée sous forme de glucose. Ce processus se déroule principalement dans les
chloroplastes des cellules végétales, des organites qui contiennent la
chlorophylle, le pigment responsable de la couleur verte des plantes.

## Les réactifs et produits

La photosynthèse consomme du dioxyde de carbone (CO2) prélevé dans l'air par
les stomates des feuilles, et de l'eau (H2O) absorbée par les racines. En
présence de lumière, ces réactifs sont transformés en glucose (C6H12O6) et en
dioxygène (O2), qui est rejeté dans l'atmosphère. L'équation bilan simplifiée
est : 6 CO2 + 6 H2O + lumière → C6H12O6 + 6 O2.

## La phase claire

La phase claire, ou phase photochimique, se déroule dans les thylakoïdes du
chloroplaste. Elle nécessite directement la lumière. Les photons excitent les
molécules de chlorophylle, ce qui déclenche une chaîne de transport
d'électrons. Cette chaîne produit de l'ATP et du NADPH, deux molécules riches
en énergie, tout en libérant du dioxygène issu de la photolyse de l'eau.

## La phase sombre (cycle de Calvin)

Contrairement à son nom, la phase sombre ne nécessite pas l'obscurité : elle
utilise simplement l'ATP et le NADPH produits par la phase claire, sans avoir
besoin directement de lumière. Elle se déroule dans le stroma du chloroplaste.
Le cycle de Calvin fixe le CO2 atmosphérique sur une molécule à cinq carbones
pour produire, après plusieurs étapes enzymatiques, des molécules de glucose.

## Les facteurs limitants

Plusieurs facteurs influencent l'intensité de la photosynthèse : l'intensité
lumineuse, la concentration en CO2, et la température. Au-delà d'un certain
seuil pour chacun de ces facteurs, la photosynthèse n'accélère plus et un
autre facteur devient limitant. C'est la loi des facteurs limitants, énoncée
par Blackman en 1905.

## Importance écologique

La photosynthèse est à l'origine de la quasi-totalité de la matière organique
sur Terre et du dioxygène atmosphérique. Elle constitue le premier maillon de
la plupart des chaînes alimentaires et joue un rôle central dans le cycle du
carbone, en captant chaque année une part importante du CO2 émis par les
activités humaines.`;

const HISTOIRE_REVOLUTION = `# La Révolution française (1789-1799)

## Les causes de la crise

À la fin des années 1780, la France royale traverse une crise financière
profonde, aggravée par le coût des guerres et l'aide apportée aux insurgents
américains. S'y ajoute une crise sociale : le Tiers État supporte l'essentiel
des impôts alors que la noblesse et le clergé en sont largement exemptés.
Enfin, une crise agricole (mauvaises récoltes de 1788) fait flamber le prix
du pain et provoque des émeutes.

## Les États généraux et le serment du Jeu de paume

Convoqués par Louis XVI en mai 1789 pour résoudre la crise financière, les
États généraux réunissent les représentants des trois ordres. Le 17 juin, les
députés du Tiers État se proclament Assemblée nationale. Le 20 juin, trouvant
leur salle fermée, ils se réunissent dans une salle de jeu de paume et jurent
de ne pas se séparer avant d'avoir donné une constitution à la France.

## La prise de la Bastille

Le 14 juillet 1789, le peuple parisien, craignant une réaction royale
armée, s'empare de la forteresse de la Bastille, symbole de l'arbitraire
royal. Cet événement, largement symbolique sur le plan militaire, marque le
début insurrectionnel de la Révolution et devient plus tard la fête nationale
française.

## La Déclaration des droits de l'homme et du citoyen

Adoptée le 26 août 1789 par l'Assemblée constituante, la Déclaration
proclame l'égalité des droits, la liberté, la propriété et la sûreté comme
des droits naturels et imprescriptibles. Elle affirme aussi la souveraineté
nationale et la séparation des pouvoirs, inspirée des philosophes des
Lumières.

## De la monarchie constitutionnelle à la République

La Constitution de 1791 instaure une monarchie constitutionnelle. Mais la
fuite manquée du roi à Varennes en juin 1791 discrédite durablement Louis
XVI. La guerre contre l'Autriche à partir de 1792, puis l'insurrection du 10
août 1792, entraînent la chute de la monarchie. La Convention proclame la
Première République le 22 septembre 1792.

## La Terreur

Face aux menaces intérieures et extérieures, le Comité de salut public,
dominé par Robespierre, instaure un régime d'exception à partir de 1793.
Plusieurs dizaines de milliers de personnes sont exécutées ou emprisonnées.
La chute de Robespierre le 9 thermidor an II (27 juillet 1794) met fin à la
Terreur.

## Le Directoire et la fin de la décennie révolutionnaire

Le Directoire (1795-1799) est un régime instable, marqué par des crises
économiques et politiques répétées. Il s'achève avec le coup d'État du 18
brumaire (9 novembre 1799), par lequel Napoléon Bonaparte prend le pouvoir,
ouvrant la voie au Consulat puis à l'Empire.`;

const MATHS_FONCTIONS = `# Fonctions dérivées

## Nombre dérivé en un point

Soit f une fonction définie sur un intervalle I et a un réel de I. On dit que
f est dérivable en a si le taux d'accroissement (f(a+h) - f(a)) / h admet une
limite finie quand h tend vers 0. Cette limite, notée f'(a), est appelée le
nombre dérivé de f en a.

## Interprétation géométrique

Le nombre dérivé f'(a) est le coefficient directeur de la tangente à la
courbe représentative de f au point d'abscisse a. L'équation de cette
tangente est : y = f'(a)(x - a) + f(a).

## Fonction dérivée

Lorsque f est dérivable en tout point d'un intervalle I, on peut définir une
nouvelle fonction, notée f', qui à chaque x de I associe le nombre dérivé
f'(x). Cette fonction s'appelle la fonction dérivée de f.

## Dérivées des fonctions usuelles

Pour la fonction constante f(x) = k, f'(x) = 0. Pour f(x) = x^n (n entier
naturel non nul), f'(x) = n·x^(n-1). Pour f(x) = 1/x, f'(x) = -1/x^2, définie
sur R privé de 0. Pour f(x) = √x, f'(x) = 1/(2√x), définie sur ]0, +∞[.

## Opérations sur les dérivées

Pour u et v deux fonctions dérivables sur I : (u + v)' = u' + v' ; (ku)' =
ku' pour k réel ; (uv)' = u'v + uv' ; (u/v)' = (u'v - uv') / v² lorsque v ne
s'annule pas sur I.

## Dérivée et sens de variation

Si f' est positive sur I, alors f est croissante sur I. Si f' est négative
sur I, alors f est décroissante sur I. Si f' s'annule et change de signe en
a, alors f admet un extremum local en a.`;

const ANGLAIS_SLIDES = `# Present Perfect vs Past Simple

## Present Perfect - form

Subject + have/has + past participle. Example: She has finished her homework.

## Present Perfect - use

Used for past actions with a link to the present, or actions with no
specific finished time. "I have visited Paris three times."

## Past Simple - form

Subject + verb (past form). Regular verbs add -ed; irregular verbs have
their own form. Example: She visited Paris last year.

## Past Simple - use

Used for actions completed at a specific, stated time in the past. "I
visited Paris in 2019."

## Key time markers

Present Perfect: ever, never, already, yet, just, since, for. Past Simple:
yesterday, last week, in 2019, ago, when I was young.

## Common mistakes

French speakers often overuse the Present Perfect where Past Simple is
required, because French "passé composé" covers both meanings.`;

const COURS_COURT = `# Le théorème de Pythagore

Dans un triangle rectangle, le carré de la longueur de l'hypoténuse est égal
à la somme des carrés des longueurs des deux autres côtés. Si un triangle ABC
est rectangle en A, alors BC² = AB² + AC².

Ce théorème permet de calculer la longueur d'un côté d'un triangle rectangle
lorsque les deux autres sont connus. Il permet aussi, par sa réciproque, de
démontrer qu'un triangle est rectangle : si BC² = AB² + AC², alors le
triangle ABC est rectangle en A.`;

describe.each([
  ["01-svt-photosynthese", SVT_PHOTOSYNTHESE, 13, 6],
  ["02-histoire-revolution", HISTOIRE_REVOLUTION, 15, 7],
  ["03-maths-fonctions", MATHS_FONCTIONS, 13, 6],
  ["04-anglais-slides", ANGLAIS_SLIDES, 13, 6],
  ["05-cours-court", COURS_COURT, 3, 2],
])("evals/golden/%s/input.md", (_name, markdown, expectedParagraphs, expectedSections) => {
  it(`splits into ${expectedParagraphs} raw paragraphs`, () => {
    expect(splitIntoParagraphs(markdown)).toHaveLength(expectedParagraphs);
  });

  it(`merges down to ${expectedSections} sections at the default 80-character threshold`, () => {
    expect(splitIntoSections(markdown)).toHaveLength(expectedSections);
  });
});
