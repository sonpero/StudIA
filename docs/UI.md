# StudIA — UI specification

This document is binding. Any screen that contradicts it is a bug, not a variation.

---

## Who this is for

Students of any age: a teenager revising for a school test, a university student
preparing an exam, an adult learning something new. Assume competence, assume no
prior knowledge of the app.

**They take the time they need.** StudIA is not a habit-loop app. It never rushes
anyone, never counts down at them, never implies they are behind. The interface
proposes; the person decides. This is a product rule, not a style preference, and
it constrains the progress and review screens directly.

---

## Visual direction

Clean, bright, generously spaced EdTech dashboard. White surfaces on a very light
grey canvas, large rounded cards, soft shadows, a very bold display face, and a
small set of saturated accents used to encode subjects.

The mood is friendly and competent. Nothing austere, nothing childish, nothing
corporate.

### Colour

Tokens live in `apps/web/src/styles/tokens.css`. **Never use a colour that is not
a token.** No arbitrary Tailwind palette values, no gradients, no coloured shadows.

| Token | Value | Use |
|---|---|---|
| `--canvas` | `#F5F7FA` | App background behind the content area |
| `--surface` | `#FFFFFF` | Cards, sidebar, panels |
| `--text` | `#101828` | Primary text |
| `--text-muted` | `#667085` | Secondary text, labels, metadata |
| `--border` | `#EAECF0` | Card borders, dividers, table rules |
| `--primary` | `#2563EB` | Active nav, links, selected state, progress |
| `--primary-soft` | `#DCEAF7` | Filled info cards (the pale blue lesson cards) |
| `--accent` | `#F04438` | The single primary call to action. Nothing else. |
| `--success` | `#12B5A5` | Completed, mastered |
| `--warning` | `#F5B940` | Due soon, needs attention |

### Subject colours

Each course gets a colour, assigned automatically at creation from this rotating
palette, and editable by the user. The colour identifies the course everywhere:
calendar chips, card left borders, task dots, plan entries.

`#F87171` `#F5B940` `#12B5A5` `#38BDF8` `#8B5CF6` `#EC4899`

Neither `--accent` nor `--primary` appears in this palette, deliberately: a
course must never look like the primary call to action or like the active nav
state.

Two rules:
- A subject colour is always paired with the course name or an icon. Colour alone
  never carries meaning.
- Subject colours are for identity only. They never indicate progress or state.

### Progress

Mastery is shown with a neutral progress device, never with subject colour: a
`--primary` ring or bar over `--border`, plus the real number ("14 / 32 notions").
The number is always visible. A ring without a number is forbidden.

### Type

| Role | Face | Use |
|---|---|---|
| Display | Plus Jakarta Sans, 800 | Screen titles, card titles, big numbers |
| Body | Inter, 400 / 500 / 600 | Everything else |

Numbers use `font-variant-numeric: tabular-nums` so counters and timers do not
jitter.

Scale: 12 / 14 / 16 / 20 / 24 / 32 / 44. The screen title is 32 on mobile, 44 on
desktop, and it is genuinely large. That contrast between one very bold title and
otherwise calm text is the personality of the design; do not dilute it by making
everything bold.

### Shape and depth

- Radius: 8px on buttons and inputs, 12px on cards, 16px on large panels, full on
  avatars and chips.
- Shadow: `0 1px 2px rgba(16,24,40,.05)` at rest, `0 4px 12px rgba(16,24,40,.08)`
  on hover for interactive cards. Never more than these two.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48. Be generous. The reference layout
  breathes, and cramming content is the fastest way to lose the look.

### Motion

150 to 200ms, ease-out. The review card flip is the one orchestrated moment.
Mascot animations are idle-only and subtle. `prefers-reduced-motion` disables the
flip and all mascot motion.

---

## The mascot

The app is embodied by **Fiche**, a revision card come to life: a rounded white
card with two dot eyes, a simple mouth, and two small arms. Friendly, a bit silly,
never cute-for-the-sake-of-it.

Why a card and not an animal: the flashcard is the core object of the product, so
the mascot flips when it thinks and shows its back when it has an answer. The
metaphor does actual work instead of decorating.

### Rules

- **Flat SVG, not 3D renders.** Illustrations must be code-maintainable. No
  raster assets, no imported 3D scenes.
- **A fixed set of poses**, in `apps/web/src/components/mascot/`. Adding a pose is
  a shared-component change: announce it.

| Pose | Where it appears |
|---|---|
| `idle` | Empty states, onboarding |
| `reading` | Extraction in progress |
| `thinking` | Generation in progress, tutor is answering |
| `celebrating` | Session finished, milestone reached |
| `confused` | Error states |
| `sleeping` | Nothing due today |

- **Fiche never speaks in the first person and is never a chat persona.** The AI
  tutor is a tool, not a friend. Fiche appears in empty, loading and error states;
  it does not comment on the user's performance and never judges.
- **One mascot per screen, maximum.** Never in a data-dense view.
- Fiche is decorative in the accessibility sense: `aria-hidden`, and the state it
  illustrates is always also written in text.

---

## Layout and responsiveness

Three breakpoints: `<768px` mobile, `768–1024px` tablet, `>1024px` desktop.
Build the desktop layout from the reference, then adapt down. Every screen must
work at 375px wide.

**Desktop** — Permanent left sidebar, 240px, white, with the wordmark at top,
icon-plus-label items, the active item in `--primary`. Content area on `--canvas`
with 32px padding. Top row of the content area holds search on the left, and
notifications plus the user chip on the right.

**Tablet** — Sidebar collapses to 72px, icons only, labels as tooltips.

**Mobile** — Sidebar becomes a bottom tab bar with four items. Search moves into
the header. The user chip moves into the header. Multi-column card grids become a
single column; the calendar becomes a scrollable week strip, never a squeezed
month grid.

### Navigation

Primary (bottom bar on mobile, top group in the sidebar):

- **Aujourd'hui** — home
- **Mes cours** — documents, notions, upload
- **Progression** — deadlines, coverage and readiness per course
- **Tuteur** — AI chat scoped to a course

Secondary (sidebar only, below a divider; behind the user chip on mobile):
**Mes notes**, **Réglages**.

Touch targets are 44px minimum everywhere.

---

## Asynchronous work

Extraction takes 30 to 60 seconds. Generation can take longer. This shapes more of
the interface than any visual choice.

- **Never block the UI on a job.** The user starts an upload and can navigate away,
  close the app, come back later.
- **Every job has four visible states**: `en attente`, `en cours`, `terminé`,
  `échec`. Failure always offers a retry and says what failed.
- **Never a full-screen spinner.** Skeleton in the shape of what is coming, plus an
  inline status line, plus the relevant mascot pose.
- **A spinner without text is forbidden.** Say what is happening: "Lecture de ta
  photo…", "Découpage du cours…", "Création des fiches…".
- **Progress must be honest.** No invented percentage. If you do not know, show
  elapsed time.
- **No optimistic UI on generated content.** Fine for a todo checkbox, not for
  anything a model produces.

Polling: TanStack Query with `refetchInterval` while the status is not terminal,
backing off after 30 seconds.

---

## Required states

Every screen that loads data implements four states. A screen missing one is
incomplete, and its Playwright scenario must cover all four.

| State | Rule |
|---|---|
| Loading | Skeleton matching the final layout. Never a centred spinner. |
| Empty | Mascot plus an invitation to act, with the action right there. Never "Aucun résultat". |
| Error | What happened and what to do. Never a raw error code. Never an apology. |
| Ready | The normal case |

---

## Screen notes

**Aujourd'hui** — Large greeting title, then today's activities as cards in the
`--primary-soft` style of the reference, each carrying its subject colour. On
desktop, a month calendar sits to the right with subject-coloured chips; on
mobile it becomes a week strip. Below, the course grid. One `--accent` button on
the screen, no more.

If nothing is due: the `sleeping` mascot, a plain statement, and one useful
suggestion. Never a guilt message, never "tu n'as rien fait aujourd'hui".

**Mes cours** — Card grid, cover or subject-coloured header, title, notion count,
progress ring with its number. Upload is a card in the grid, not a floating button.

**Upload** — Camera first on mobile, file picker first on desktop. Multi-page
capture is one document: several photos of the same lesson produce one course.
Thumbnails, reorderable and removable, before confirming.

**Révision** — Focused view: navigation dims but does not disappear, since sessions
are meant to be unhurried and leaving must never feel like a trap. One card at a
time, generous whitespace. Space to reveal, 1 to 4 to rate on desktop. Leaving
mid-session saves progress. No timer, no countdown, no "hurry".

**Progression** (M5: `progress` module — see `docs/modules/progress.md`) —
One card per course, no day list, no calendar. Each card carries two gauges
and one status line.

- **Coverage** — the neutral progress device (`--primary` over `--border`,
  real percentage always shown), answering "how much of this course have I
  opened at all": the share of notions with at least one review done,
  regardless of how well it went.
- **Readiness** — same neutral device, a second gauge, answering a
  different question: "if I do nothing else between now and the exam, how
  will this hold up that day." It is a projection forward to the deadline,
  not a reading of today.
- **Status line** — one sentence per course stating the deadline, both
  percentages, and, only when behind, how many notions: *"Maths, contrôle
  dans 9 jours, 54 % de préparation, 7 notions à consolider avant
  l'échéance."* No countdown widget: the day count is a fact restated on
  load, never a ticking or colour-shifting clock.

Two things this screen must explain, or the numbers read as broken:

- **Coverage can look low right after notions are added to a course** — the
  denominator grows before any of the new content has been touched. The
  screen never claims coverage "dropped": this module computes everything
  at read time and keeps no previous reading to compare against — no plan,
  no history, no snapshot (`docs/modules/progress.md`). Instead, whenever
  there are notions created in roughly the last week that have never been
  reviewed, it states that present-tense fact next to the number: *"3
  fiches ajoutées récemment n'ont pas encore été travaillées."* A low or
  moved number must never be left for the student to puzzle over, but the
  explanation is a fact about today's notions, never a comparison to a
  remembered past state.
- **Readiness can hold perfectly still for weeks while the course quietly
  slides behind.** With a deadline set, readiness only moves after an
  actual review — it is not recomputed to decay on its own merely because
  time passed. What does move on its own is the target the course is
  measured against, which climbs toward the exam date regardless of
  activity, so the status can worsen (ahead → on-track → behind) with the
  readiness percentage completely unchanged. This must not read as the
  screen being frozen or broken: the status word and, once behind, the
  notion count are what carry the "time is passing" signal, deliberately
  instead of the percentage — see `docs/modules/progress.md` for why.

**On the deadline day itself, never show the status word, `--warning`
styling, or the notion count.** The target the course is measured against
reaches its ceiling exactly on that day by construction, so most courses
would otherwise flip to "behind" with a large notion count on the one
morning nothing can still be done about it — the loudest possible alarm at
the least actionable moment, the direct opposite of "no urgency." Show the
two percentages plainly, with a neutral "c'est aujourd'hui" framing and no
status word at all that day.

A course behind its target is stated as a fact, never scolded: the status
word plus the notion count (never a percentage-point deficit, never a time
estimate), in `--warning`, never `--accent`, and never a comment on why or
since when. No streak, no "tu n'as pas ouvert ce cours depuis 5 jours", no
red.

**Tuteur** — Standard chat, scoped to one selected course, streamed answers with
citations back to notions. Fiche in `thinking` while it streams, and gone once the
answer starts.

---

## Copy

French, tutoiement, sentence case, no emoji.

- Say things the way a student does: "cours", "fiche", "révision", "contrôle".
  Never "document", "entité", "pipeline", "extraction".
- A button says what happens: "Créer les fiches", not "Valider".
- The same word through a whole flow: "Créer les fiches" then "Fiches créées".
- Errors do not apologise and are never vague. Not "Une erreur est survenue" but
  "La photo est trop floue pour être lue. Reprends-la avec plus de lumière."
- Empty states invite: "Aucun cours pour l'instant. Prends ton cours en photo pour
  commencer."
- Never comment on pace or effort. No "tu es en retard", no "3 jours d'affilée",
  no "plus que 2 jours". State facts: "Contrôle le 12 juin", "14 fiches à revoir".

**No streaks, no badges, no points.** Progress is the real count of notions
mastered. That number is true, and it is what the exam measures.

---

## Accessibility floor

Checked in the Playwright suite:

- Visible keyboard focus everywhere. Never `outline: none` without a replacement.
- Contrast AA on all text. `--accent` and `--warning` are never text colours on
  white at body size.
- `prefers-reduced-motion` respected, including for the mascot.
- Every field has a real `<label>`. A placeholder is not a label.
- The review screen is fully operable by keyboard.
- Mascot illustrations are `aria-hidden` and never the sole carrier of meaning.

---

## Forbidden

- Modals for anything longer than a confirmation
- Toasts for blocking errors
- Carousels
- Gradients, coloured shadows, glassmorphism
- More than one `--accent` element per screen
- Icon-only buttons without an accessible label
- Infinite scroll
- Any colour outside the token set
- Countdown timers, streak counters, urgency language

---

## For agents

- shadcn/ui is the component base. Restyle through tokens; never fork a component
  to change a colour.
- New shared components go in `apps/web/src/components/ui/`, mascot poses in
  `apps/web/src/components/mascot/`. Announce either in your message: shared
  components are where parallel agents collide.
- If a screen needs a pattern not described here, stop and ask. Do not invent an
  interaction model and leave the human to find it in review.
