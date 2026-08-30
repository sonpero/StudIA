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
- **A form or list that is not already sized by a card or a grid column
  never stretches to the bounded column's full width.** Cap it at a
  reasonable width instead (448px, Tailwind's `max-w-md`, is the default
  absent a better reason). When it *is* a grid item or lives inside a card,
  the card/column already gives it a sane width — no separate cap needed,
  and stacking one on top of the other (a cap inside a card already capped
  by its grid column) only makes it narrower than its neighbours for no
  reason.
- **Native form controls need `appearance-none` plus a token-coloured
  replacement, not just width discipline, to stop reading as an unstyled
  browser control.** A native `<select>`'s dropdown arrow and an
  `<input type="date">`'s calendar icon are drawn by the browser regardless
  of the box's width; only removing that native paint (`appearance-none`)
  and substituting a token-coloured one (a background-image chevron for
  `<select>`) actually reads as designed. What CSS alone cannot reach at
  all — the calendar icon's exact shape, the locale placeholder ("jj/mm/aaaa")
  an empty date field shows — stays native; replacing those needs a custom
  date-picker component, which is a new interaction pattern (see "For
  agents" below) this document does not currently ask for.

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
with 32px padding, its content capped at a max-width of 1152px and centred —
cards, forms and text never stretch to the edge of a wide viewport. Top row
of the content area holds search on the left, and notifications plus the
user chip on the right.

**Tablet** — Sidebar collapses to 72px, icons only, labels as tooltips.

**Mobile** — Sidebar becomes a bottom tab bar. Search moves into the header.
The user chip moves into the header. Multi-column card grids become a
single column.

**Not yet built, disclosed rather than silently skipped:**
- **Icons.** "Icon-plus-label" and the tablet 72px icon-only collapse both
  depend on an icon set this app doesn't have; adding one is a real
  dependency needing its own justification (CLAUDE.md), not a layout
  choice. Nav items are text-only for now, and the sidebar keeps its full
  240px width through the tablet breakpoint instead of collapsing — it only
  becomes the mobile bottom bar below 768px.
- **Search and notifications.** Neither exists yet. The content area's top
  row currently holds only the user chip (greeting and sign-out).
- **The secondary group.** Mes notes and Réglages have no screen at all
  yet (no module built past its own spec in `docs/modules/`). The
  persistent nav — sidebar and bottom bar alike — renders only the four
  real destinations below (Aujourd'hui, Mes cours, Progression,
  Calendrier); there is no divider, no secondary group, and no
  placeholder standing in for what isn't built. Tuteur is the one primary
  item still missing a screen — five destinations is the target, four is
  what exists.

### Navigation

Primary (bottom bar on mobile, top group in the sidebar):

- **Aujourd'hui** — home
- **Mes cours** — documents, notions, upload
- **Progression** — deadlines, coverage and readiness per course
- **Calendrier** — this month's deadlines and dated todos, at a glance
- **Tuteur** — AI chat scoped to a course

Secondary (sidebar only, below a divider; behind the user chip on mobile):
**Mes notes**, **Réglages**.

This is the target set (see "Not yet built" above for what the nav actually
renders today). **Progression is reachable directly from the nav now, not
only from within a course** — when entered that way there is no originating
course to return to, so its own screen's "Retour" goes to `Mes cours`
instead of a specific course's notion list. The screen's own content is
unaffected either way: it always shows every course (`docs/modules/progress.md`).

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

**Aujourd'hui** — Large greeting title, then **one card per course** that has
something to say today, never split into separate lists by kind. A course
with nothing due, nothing below its exam target, and no deadline gets no card
here at all: this screen answers "what do I do now", not "what are all my
courses" — that catalogue is `Mes cours`. When every course is like that, or
there are no courses yet, the screen falls to its empty state below.

**One grid, not two.** Course cards and the todos card (below) are items in
the *same* grid — one column below the tablet breakpoint, two on desktop —
so their edges share the same gutters instead of the todos block landing in
its own, differently-sized column underneath. Grid items keep their own
height (`items-start`, never the grid's default stretch): a short card next
to a taller one is never stretched to match it, which would leave dead
space under its buttons. Course cards fill the grid left to right, top to
bottom, in whatever order `TodayView` returns them; the todos card is simply
the next item after the last course card, wherever that lands — not pinned
to a fixed side.

A course's card states, together, whichever of these apply to it — never
across separate cards, so the same course never appears twice:

- **Due today** — "X fiche(s) à revoir aujourd'hui", the FSRS-due count.
- **Below target** — "X notion(s) à consolider avant l'échéance", the exact
  phrase `Progression` already uses for the same fact
  (`docs/modules/progress.md`'s `notionsBelowTargetForDocument`), reused
  verbatim so the same number reads the same way on both screens.
- **Deadline**, as a plain fact ("Contrôle le 12 juin, dans 9 jours"), never a
  countdown.

A due count and a below-target count for the same course can both be
non-zero at once. That is not a contradiction — they measure different
things — and the wording carries that distinction on its own, without naming
FSRS or the scheduling model to the student.

Every card is a path to action, not just a number, through two explicit
buttons — same idiom as the per-item actions on `Mes cours`' own course
page, never a click hidden on the title: "Voir le cours" always opens that
course's page, and, only when the due count is above zero, "Réviser" starts
a review session for that course directly. Both `--secondary`, never
`--accent` — several cards on one screen would otherwise mean several accent
elements, which the Forbidden list bans.

If nothing needs attention anywhere: the `sleeping` mascot, a plain
statement, and one useful suggestion. Never a guilt message, never "tu n'as
rien fait aujourd'hui".

**One todos card**, not three loose pieces: the checklist, the minimal add
form (label, required; date and course, both optional — nothing else, no
priority, no tags, no recurrence), and the planner-photo upload all live
inside one `Card`, stacked. That single card is what sits in the shared grid
above — a card is the unit the grid lays out, not each piece of it
separately, which is what made the add form read as misaligned with the
list above it before this card existed. Each todo gets a small delete
action ("✕", with an accessible label naming the todo — same idiom as the
staged-file removal on `Mes cours`' own upload card, not a bare icon
without one) alongside its checkbox. No confirmation modal: a todo is low
stakes and trivially re-added.

**A todo's due date, when it has one, is shown on its row** — discreet,
right-aligned, before the delete action. No date set means nothing shown
there: never a dash, never "sans date". The same rule as everywhere else
in this document applies to how it reads: a plain dated fact, never a
countdown, and a date already past renders exactly like one still to
come — no `--warning`, no colour of any kind marking it overdue.

**The add form and the photo picker are both collapsed by default**,
behind their own discreet `--secondary` action ("Ajouter un todo" /
"Ajouter des todos depuis une photo de l'agenda") — a permanently open
input for either was, by itself, wider and taller than the list it sat
below. Opening the add form puts focus on the label field. Escape closes
it again without discarding what was already typed — reopening shows the
same draft, not a blank form — except when there was nothing to lose, in
which case closing is simply closing. A successful submission collapses
the form on its own and the new todo appears in the list below; nothing
else about the checklist or the photo path changes.

Native form controls still get the design-system border, radius and colour
tokens (`<select>`'s own arrow replaced with a token-coloured chevron,
`appearance-none` on both); what a browser's own chrome renders and CSS
alone cannot reach — the calendar icon's shape inside `<input type="date">`,
its locale placeholder — stays native. Replacing those needs a custom
date-picker component, a new interaction pattern this pass does not
introduce (`docs/UI.md`'s own "stop and ask" rule for agents).

This screen has no "Retour": it is the destination the sidebar/header's
"Aujourd'hui" link leads to from anywhere, not a place one arrives at from
elsewhere and backs out of. The same header carries a symmetric "Mes cours"
link, so both homes stay reachable from any screen.

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
  notions ajoutées récemment n'ont pas encore été travaillées."* (notions,
  never "fiches" — this counts notions, and the two units coexist elsewhere
  in the app and must not be confused.) A low or
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

**Calendrier** (`workspace` module — see `docs/modules/workspace.md`'s
Calendar section) — A month grid: seven weekday columns, a row per week,
"‹ Mois précédent" / "Mois suivant ›" navigation either side of the current
month's name ("Mars 2026"), both real `--secondary` buttons with their own
accessible label, never a bare arrow glyph. Every day is clickable,
including an empty one; selecting a day highlights its cell (`--primary-soft`,
the same selected-state token used elsewhere) and reveals its contents in a
panel below the grid, never a modal — a day can hold several entries, and
the Forbidden list below reserves modals for something shorter than that.

**A day cell holds at most three tokens, always: up to three dots, or two
dots plus a count.** Three entries or fewer — a deadline and two todos,
say — render as one dot each, in full. Four or more — a deadline and
three todos, the case that actually breaks a calendar grid — render as
two dots (the deadline, then the first todo, in the order
`docs/modules/workspace.md`'s Calendar section guarantees: every
deadline before every todo) plus a "+N" badge counting the rest (here,
"+2"). The cell's width never depends on how many things happened that
day; only which of the two shapes it's showing does.

A deadline's or a course-linked todo's dot is that course's subject
colour; **a todo with no linked course gets a neutral dot
(`--text-muted`), never a colour it doesn't have.** Each dot's accessible
name is the course title (or "Todo sans cours" for the neutral one) even
though there is no room to print it inline at that size — colour is never
the dot's only carrier of meaning, the same rule as everywhere else in this
document, satisfied here through an accessible name instead of adjacent
visible text. The "+N" badge is exactly that: a number, never a colour of
its own — it stands for entries of several different courses at once, so
no single subject colour could represent it without lying.

**This is the one screen where the reference's own layout inspiration
stops applying, on purpose:** colour marks subject, never time. No dot
brightens, reddens, or otherwise escalates as its date approaches — a
deadline three days out and one three months out use the identical dot. A
past date renders exactly like a future one; the grid's own left-to-right,
top-to-bottom order already says which day is past, and nothing needs to
say it again. The one exception, and it is wayfinding, not severity:
today's cell gets a `--primary` ring, the same token that already marks
"active" everywhere else in the nav — a place marker, not a warning.

**The day panel is where "+N" actually gets answered: it lists every
entry for that day, uncapped** — the cell's three-token limit is a cell
constraint, not a data limit, so clicking a busy day is the whole point,
not a dead end. Same order as the cell truncates from, deadlines first:
a deadline gets its dot, its title, and a "Voir le cours" action (same
idiom as everywhere else a deadline links out); a todo gets its dot, its
title, and nothing to click — read-only, no checkbox, no delete, managing
todos stays on Aujourd'hui, this screen only says what is due when. A
done todo appears struck through, matching Aujourd'hui's own treatment of
one.

Four states: **loading** is a skeleton grid, the same shape as the real one
(placeholder cells, no numbers, per the Required states rule); **error** is
the `confused` mascot and a retry; **ready** is the grid, with or without
dots — **a month with nothing in it is still ready, not empty.** The grid
itself is the useful surface even at zero events (you can still page to
another month), unlike a list screen where zero rows really is nothing to
show. No mascot for a quiet month.

**Lecteur** (M7 addition — see `docs/MILESTONES.md`) — Reached from a course's
card on Mes cours ("Lire le cours", replacing the old "Voir le texte" toggle,
same `status === "done"` gate that button already had), never from the nav:
this is a drill-down from a specific course, the same shape as Notions du
cours, not a top-level home, so it keeps its own "‹ Retour à mes cours" rather
than relying on the nav's generic "Mes cours" the way Aujourd'hui and
Calendrier do.

**Renders the course's extracted markdown, never its notions strung
together, and this is a deliberate distinction, not an oversight.** A
notion's `body` is self-contained by design so it reads out of order during
review (`docs/modules/content.md`) — concatenating 5 to 60 of them produces a
repetitive, choppy sequence, each restating context the one before it just
gave, not a readable course. The extraction markdown is the actual document
as written or photographed; that is what "read the course" means here.
`react-markdown` renders it through this app's own token classes (headings,
lists, emphasis), not `@tailwindcss/typography`, which would bring its own
spacing and colour scale to reconcile against `tokens.css` for a job this app
already does by hand on every other screen. The reading column caps at
`max-w-2xl`, narrower than the rest of the app's 1152px content width — a
deliberately shorter line length for continuous prose, the same "cap it
instead of stretching it" principle as Shape and depth's form-width rule.

**No progressive loading, no infinite scroll, one normal scrolling page.**
Measured, not assumed: `react-markdown`'s own render pipeline, timed via
`react-dom/server`, renders a synthetic 60-"page" document (251 KB of
markdown, well past what this app's own documents are likely to reach) in
63 ms, and a deliberately extreme 250-"page" one (1 MB) in 254 ms — both a
one-time cost on opening the screen, not a per-frame one. A paginated,
swipe-to-continue reading mode was also considered and set aside — not
because it is a bad idea, but because it answers a reading-comfort
preference nobody asked for, and the measurement above is exactly why it
was left as a preference rather than escalated into a technical
requirement: there is no slowness here for pagination to fix.

Four states: **loading** is a skeleton (short animated bars in the reading
column, no mascot — no screen in this app puts a mascot on a plain network
fetch); **error** is `confused` and a retry, same wording pattern as every
other screen; **ready** is the rendered markdown, no mascot (data-dense,
docs/UI.md's one-mascot rule already excludes it). Within ready, the
document's own extraction status branches further, since this screen is
reachable by more than its one gated button — a stale button render, a
future entry point, anything that skips the check must still land somewhere
defined:
- still extracting (`pending`/`running`): `reading`, "Ce cours est encore en
  cours de lecture. Reviens dans un instant.", polling on the same
  30-second-backoff schedule Mes cours already uses for exactly this,
  so the screen resolves itself if left open rather than needing a manual
  reload
- `failed`: `confused`, "La lecture de ce cours a échoué. Mets-la à jour
  depuis Mes cours." — no retry button here; that mutation already lives on
  Mes cours and this screen does not duplicate it
- `done` with nothing readable (markdown null or blank): `idle`, "Ce cours
  ne contient pas encore de texte lisible."
- `done` with real content: the actual reader — course title and subject
  colour dot, then the rendered markdown

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
