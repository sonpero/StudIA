# StudIA — UI specification

This document is binding. Any screen that contradicts it is a bug, not a variation.

---

## Who this is for

Students of any age: a teenager revising for a school test, a university student
preparing an exam, an adult learning something new. Assume competence, assume no
prior knowledge of the app.

**They take the time they need.** StudIA is not a habit-loop app. It never
rushes anyone and never implies they are behind. The interface proposes; the
person decides. This is a product rule, not a style preference, and it
constrains the progress and review screens directly: neither ever says
"you are behind" or "you are late", only what is true.

**M9 narrows "never counts down", it does not drop it.** A blanket ban on any
day count read as a habit-loop reflex worth avoiding by default, not as the
one line separating this app from one. The streak (visible from every
screen, in the persistent nav sidebar — `Screen notes`' own Aujourd'hui
note, below, explains why it moved there) and Aujourd'hui's own course
cards' relative countdown badge (`Colour` and `Screen notes`, below) are a
deliberate, requested exception: a day count stated once, as a fact, is
not the same thing as a ticking timer or a red "3 jours restants"
pressuring a specific action. Progress and review
keep the stricter rule exactly as written above — no status word ever
implies lateness, no colour turns urgent on a deadline's own day
(`Progression`'s own note, below) — because unlike Aujourd'hui's badge, both
screens attach a day count to an evaluative judgement, which is the part
this rule was always actually protecting against.

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
| `--primary` | `#0F7B5F` | Active nav, links, selected state, progress, the single call to action |
| `--primary-soft` | `#E2F3EE` | Filled info cards (the pale green lesson cards) |
| `--success` | `#12B556` | Completed, mastered |
| `--warning` | `#F5B940` | Due soon, needs attention |

**M9 merges `--accent` into `--primary` — one green, not two tokens for two
roles.** Previously kept deliberately separate (an earlier version of this
same section argued the two "answer different questions — which nav item is
active, versus which button on this card is the one to press" — true, and
still true as a description of the *roles*), reversed here at explicit
request rather than rediscovered as wrong: a single brand colour for both
roles is the point of the redesign, not a side effect of it. The role
distinction the old argument protected — nav/links versus "the one button to
press" — still exists in the interface and still matters (`One accent-
weighted action per card`, below, is unchanged); it is no longer expressed
as two different hues, only as which element gets the colour at all.
`variant="accent"` stays the name of that role in `Button`'s own code
(`apps/web/src/components/ui/button.tsx`) and in this document's own prose
below — a role name now, not a second colour, so existing call sites
("Réviser", "Confirmer", "Discuter") needed no change beyond which token
their class list points at.

**The surviving value is `--accent`'s old one, `#0F7B5F`, not `--primary`'s
old `#2563EB`.** Kept for the reasons the paragraph below already
established when this value was first chosen — measured white-text contrast,
clearance from the subject palette, clearance from `--success` — all of
which stay true unchanged since the hex itself doesn't move, only which
token name owns it and how many other elements now render in it (nav-active,
links, focus rings, in addition to the one call-to-action button). Reusing
`--primary`'s own old indigo instead was not seriously considered: the
paragraph below already rejected that exact hue once, for reasons that don't
depend on how many roles it's asked to carry.

**A deep green, not the indigo that first replaced red.** `#F04438`, this
token's original value, was tried and rejected in an earlier version of
this same pass: white text on it measured 3.76:1, under the 4.5:1 floor
`Accessibility floor` (below) demands, a real pre-existing failure this
pass's own contrast check caught. Darkening it to `#D92D20` (same hue,
4.83:1) fixed the contrast but not a second, worse problem, found by
looking at the screen with real course cards rather than trusting the
numbers alone: `#D92D20` sat 3.9° from the subject palette's own red
(`#F87171`) — a course's own identity colour and the app's one call-to-
action, indistinguishable on Mathématiques' own card. Reusing the old
`--primary`'s indigo was tried next and did clear that collision (22.8° from
the palette's own closest hue), but was set aside for a different reason: it
is Tailwind's own default blue, instantly recognisable as such, and wearing
a framework's stock colour as the app's own signature reads as an
un-designed, generated interface. `#0F7B5F`, a deep green, is what this
pass settled on instead — chosen for what it says, not just what it avoids:
green already means "forward, on track" everywhere outside this app, which
is exactly what pressing "Réviser" is, where blue said nothing in
particular. Measured, not assumed: white text on `#0F7B5F` is 5.23:1,
clearing 4.5:1 with room to spare, no lightness adjustment needed. M9's
merge inherits this reasoning rather than reopening it: nav-active and
links now say the same "forward, on track" thing every accent button
already said, which is the intended reading, not an accident of reuse.

**`--primary-soft` is a tint of the same merged green, recomputed, not
reused from the old indigo tint it replaces.** `#E2F3EE` (same 164° hue,
low saturation, high lightness) — a light-mode fill for `bg-primary-soft`
elements (the active-nav pill, message bubbles) that reads as "this token's
own pale version," not as an unrelated leftover blue sitting next to a green
active state.

**Every semantic colour token's hue family is excluded from every other,
enforced, not just written down.** First written as an accent-vs-subject-
palette rule alone; widened once `--accent`'s own move to green surfaced a
collision this narrower rule couldn't see: `--success` (`#12B5A5`, hue
174°) sat 9.7° from the new `--accent` (`#0F7B5F`, hue 164°) — the same
family of problem, between two *semantic* tokens this time, not a
semantic token and a subject colour. The real invariant was never "the
accent avoids the subject palette", it is "no two colours this app hands
out a fixed meaning to — `--primary` (`--accent`'s own old value, since
M9's merge, above), `--success`, `--warning`, and every subject-palette
hue — read as the same colour."
`15°` remains the floor (unchanged from the narrower version of this
rule): nothing new has been measured to move it, and the values below sit
either comfortably clear of it or were moved specifically to clear it.
`apps/web/src/styles/tokens.colour-collision.unit.test.ts` (renamed from
`tokens.accent-collision.unit.test.ts`, no longer accent-specific) now
checks every pair drawn from that full set, not just accent-vs-palette.
**M9 shrinks that set by one, not the check itself**: `--accent` merged
into `--primary` (above), so the test's own token list drops the name
`--color-accent` and keeps checking every remaining pair at the same 15°
floor — one fewer name, same coverage of everything that still exists,
never fewer checks than it ran before.

Two collisions this widening found, both fixed by moving the *subject*
colour, never a semantic token — the same policy the accent/turquoise fix
above already established, extended rather than reconsidered. Both are
stated below against the name in force when each was fixed, `--accent`,
which is `--primary`'s own value since M9's merge — the hue and every
measurement are unchanged, only the token's name is:
- SVT's default (`#12B5A5` originally, already moved once to `#12B2B5` for
  `--accent`'s sake) stays exactly where that first move put it (hue 181°,
  16.6° from `--accent`) — a corridor between `--accent` (164°) and the
  palette's own sky blue (198°) only 34° wide, so 15°+ clearance from both
  fixed ends caps the best possible margin near where it already sits;
  moving `--accent` or the sky blue would be needed to open more room, and
  neither is being reopened here.
- Anglais's default (`#F5B940`) was not just close to `--warning`, it *was*
  `--warning` — the exact same hex, a 0° gap missed until this pass because
  the original rule never compared a subject colour to anything but
  `--accent`. Confined to a genuinely narrow spot: 15°+ from `--warning`
  (40°) on one side and from the palette's own red (0°) on the other leaves
  a 10°-wide corridor, `[15°, 25°]` — landed at its centre, 20°, for the
  same reason SVT's fix landed at its own corridor's centre.

**`--success` moves, it is not retired, even though `--primary` now also
means "forward, on track" for every one of its roles, not just the button
that used to be `--accent`.** Considered and rejected: the two tokens still
answer different questions on the one screen where they appear
together — `ReviewScreen.tsx`'s graded MCQ view sets `ring-success` on
whichever option was factually correct and, when the student picked a
*different* option, `ring-primary` on that wrong pick (`ring-accent` before
M9's merge — same hue, the class changed because the token backing it did),
both visible at once, on two different options in the same list. Collapsing
them into one green would leave nothing distinguishing "this was the right
answer" from "this is merely what you clicked" at the exact moment a wrong
answer most needs to read as wrong — the opposite of decorative,
load-bearing for the one thing this app is for. Moved to `#12B556` (hue
145°, clear of the whole `--primary`/turquoise cluster entirely rather than
squeezed beside it — 19.4° from `--primary`, comfortably past the floor).

**That 19.4° passed the hue-collision test and still failed on screen.** A
live check of exactly this ReviewScreen state (a QCM graded wrong, both
rings visible together) found the two rings read as the same green at a
glance — the two-token distance was measured correctly, but a floor tuned
for telling *palette* hues apart was never validated against a thin 2px
ring at these particular lightness/saturation values, and it doesn't hold
up here. Not fixed by moving either token further apart: flagged for when
the palette is next reopened, not resolved now, because the real defect
is one level up, below.

**Two states that can coexist in the same list are never told apart by
hue alone, however far apart their hues measure.** This is the general
form of the failure above, and it generalises past this one screen: "this
option is factually correct" and "this is what you clicked" are two
different facts, and colour was the only channel carrying that difference
— exactly the "colour alone" case `Accessibility floor` and `Subject
colours`' own rules already forbid elsewhere, just not yet named for
*state*, only for identity. Wherever a screen needs to show two or more
coexisting outcomes on peers of the same list, at least one of them needs
a non-hue signal — shape, an icon, a position, text — and colour, if used
at all, only reinforces it.

**ReviewScreen's own fix: an icon per outcome, not a truer green.** The
graded MCQ view now pairs each ring with a `lucide-react` icon on that
same option — `Check` on the factually correct one, `X` on the student's
wrong pick — so the shape carries the distinction and the ring becomes
reinforcement, not the sole signal. Verified by turning the same screen
state to grayscale: both facts still read, because neither ever depended
on hue.

**These two icons are not decorative, unlike every other icon `Icons`
(below) places in this app.** `Icons`' own rule — icon `aria-hidden`,
label carries the accessible name alone — assumes the icon is redundant
with text already on screen. It isn't here: nothing else attached to
*this specific option* says "this was the right answer" or "this is what
you picked" — `grade.feedback` states the correct answer's text once,
below the whole list, which does not by itself tell a screen-reader user,
navigating option by option, which button they are currently on. The
icon SVGs themselves stay `aria-hidden`/`focusable="false"` (their shape
carries nothing a screen reader can use), but each now sits beside a
visually-hidden (`sr-only`) text span — "Bonne réponse" / "Ta réponse" —
so the option's accessible name carries the same fact its icon shows
sighted users, without printing a second, redundant visible label next to
an already-labelled option.

**Destructive actions carry no colour of their own, still — settled here so
it stays a decision, not a gap.** "Supprimer" (a document, a deadline, a
todo, a staged upload photo) has always rendered as a plain `--text-muted`
underlined link or a bare icon, never a button, never a colour — true
before this pass and left exactly as it is. Freeing red from accent duty
does not make it the app's new danger colour: repurposing it that way
would put a saturated warning-red next to every delete action, the same
loud, alarm-reading problem this pass just removed from the primary
action, now on the destructive one instead — a straightforward
contradiction of `Who this is for`'s own "never rushes anyone" stance.
Destructiveness here is signalled by visual demotion (a small, easy-to-
skip link, not by colour), which is also why none of these actions carry a
confirmation modal: low visual weight already tells the story `--warning`
or a red button would otherwise have to carry.

**One accent-weighted action per card, not per screen.** `Forbidden`
(below) has always banned a second accent-styled element competing for
attention on the same screen — right for a single-purpose screen
(Connexion, UploadCard's own confirm step) where every accent element really
does compete with every other one for the same decision. It reads
differently on a screen that is a *grid of independent cards* (Aujourd'hui,
Notions du cours): each card is its own self-contained decision, so two
course cards each showing their own accent "Réviser" are not two accent
elements competing for one choice, they are two separate one-choice cards
shown at once — the same shape ReviewScreen's own accent buttons already
have, one at a time, just several instances of the same shape visible
together instead of hidden behind sequential steps. The invariant that
actually matters, and the one a screen must never violate, is scoped to the
card: **never more than one accent element inside a single card.** Concretely:
Aujourd'hui's own course card's "Réviser" (`Aujourd'hui`'s own note, below)
and Notions' per-notion card's own "Réviser" (`Icons`' own note, and
`Screen notes`' own Notions note, below) are both accent, one per card,
for the same reason in both places. Notions' own course summary card
(`Screen notes`, below) adds a third instance of the identical shape: its
own "Réviser N fiches" is that card's one accent element, reviewing the
whole course rather than one notion — a separate card making its own
separate one-choice decision, the same as any two course cards on
Aujourd'hui, not a second accent competing with any notion card's own.

### Subject colours

Each course gets a colour, assigned automatically at creation from this rotating
palette, and editable by the user. The colour identifies the course everywhere:
calendar chips, card left borders, task dots, plan entries.

`#F75757` `#F36016` `#109DA0` `#0897D6` `#8B5CF6` `#EC4899`

`--primary` does not appear in this palette, deliberately (before M9's
merge, neither did the separate `--accent`; the rule and the reason are
unchanged, there is simply one token to keep out instead of two): a course
must never look like the app's one call-to-action or its active nav
state — and neither does any hue close enough to `--primary`'s own to read
as the same colour, `Colour`'s own note above (SVT's own default, tested
and enforced there, is what changed to hold this).

Two rules:
- A subject colour is always paired with the course name or an icon. Colour alone
  never carries meaning.
- Subject colours are for identity only. They never indicate progress or
  state — **except Progression's own detail card and its gauges**
  (`Screen notes`' own Progression note, below), a deliberate reversal per
  the user's explicit instruction for that screen only: coverage and
  readiness are filled with the selected course's own colour there, not
  `--primary`. Every other screen keeps this rule exactly as written.

**Card left border, not a tinted background.** Where a course gets its own
card, the colour runs as a 4px solid border down the card's left edge,
`aria-hidden` like the dot it replaces, paired with the course title the
same rule above already requires. **Aujourd'hui's, Mes cours' and
Progression's own course cards no longer follow this rule**, each
redesigned from its own mockup to a colour-tinted icon circle instead
(`Screen notes`' own notes for all three, below, explain each departure) —
this rule still holds everywhere it has not been named as an exception.
Progression's own "Tous les cours" list (below) is the one partial
exception to the exception: its rows keep a left border, but only on
whichever row is currently selected, a selection cue rather than a
permanent identity marker.
The rest of the card stays `--surface` white with its ordinary `--border`
edge on the other three sides; nothing about body text's background changes.
A tinted fill was considered and set aside for exactly that reason: this
palette rotates automatically per course and is meant to become user-editable
(see above, not yet built), so a background tint would need a fresh,
per-hex-and-per-edit contrast check against the card's own text forever,
where a border needs none — it carries no text of its own to stay readable
against. The second rule above still applies at full strength to the border:
a course behind its target gets the exact same border as one on track or
ahead, never `--warning`, never a heavier or brighter version of its colour.

**Measured and enforced, not just measured.** A border still has to be
visible against `--surface` to do its one job, and this was flagged twice
without ever actually being fixed: first as "three of the six land under
the 3:1 guideline", a miscount — the real number, confirmed by recomputing
every value rather than trusting the earlier note, was **four of six**
(`#F87171` 2.77:1, `#F5B940` 1.77:1, the old `#12B5A5`/`#12B2B5` turquoise
2.57–2.61:1, `#38BDF8` 2.14:1 — only `#8B5CF6` at 4.23:1 and `#EC4899` at
3.53:1 ever actually passed). Visible on screen before the fix, not just on
paper: Anglais's own card border read noticeably paler than its neighbours.
All six now clear 3:1, same hue each (Anglais moved hue too, forced there
by the corridor above; the other three kept their hue, only darkened):

| Course (example) | Old | Old contrast | New | New contrast |
|---|---|---|---|---|
| Mathématiques | `#F87171` | 2.77:1 | `#F75757` | 3.25:1 |
| Anglais | `#F5B940` | 1.77:1 | `#F36016` | 3.23:1 |
| SVT | `#12B2B5` | 2.61:1 | `#109DA0` | 3.31:1 |
| Histoire-Géo | `#38BDF8` | 2.14:1 | `#0897D6` | 3.28:1 |
| Physique-Chimie | `#8B5CF6` | 4.23:1 | unchanged | 4.23:1 |
| Espagnol | `#EC4899` | 3.53:1 | unchanged | 3.53:1 |

`tokens.colour-collision.unit.test.ts` holds every one of these to 3:1
against `#FFFFFF`, alongside the hue-distance rule above — a value is
only admissible if it clears both, not either. The palette itself is `ingestion`'s domain
(`packages/core/src/ingestion/domain/colour.ts`); this is the second pass
to touch it, both times for a measured reason named here rather than left
for someone to rediscover.

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

**Four explicit size tokens** (`tokens.css`'s `--text-*`), each with exactly one
job — replacing the flat `text-sm` every card, title and number sat at
regardless of role before this pass:

| Token | Size | Role |
|---|---|---|
| `--text-label` | 12px | Small muted labels: a section header ("Todos"), a gauge's own label ("Couverture"), a fieldset legend. Never the loudest thing on its card. |
| `--text-body` | 14px | The default — everything not a label, a title, or a display number. Already every screen's baseline (Tailwind's own `text-sm`); named here for completeness, not a new class to apply anywhere. |
| `--text-title` | 20px | Card and course titles — Aujourd'hui's course cards, Progression's, a notion's own, the reader's course heading. One step up from the 16px they shared with plain body text before. |
| `--text-display` | 32px | The one dominant number on its line: a due count, a gauge percentage, a mastered-notions count. Display face (Plus Jakarta Sans, 800, `tabular-nums`), its unit and qualifier beside it in `--text-label` and `--text-muted` — never the reverse, and never both the same size. |

**`--text-display` marks a card's own number, never a page's chrome.** The
table above names "a mastered-notions count" as one dominant-number
example among the others — true for one drawn inside a card (Progression's
own gauges, Aujourd'hui's own due count), where the number is that card's
one piece of information and nothing else on it competes for the same
attention. It stops being true the moment the same count sits in a
screen's own toolbar, between the page title and the toolbar's own
actions: there the count is chrome, one fact among several on the same
row, not a card's single dominant content, so display weight does not
clarify the row, it competes with the `<h1>` beside it for attention.
Found on Notions' own toolbar count, before its later redesign ("0 / 34
notions maîtrisées"): its "0" rendered at 32px next to a 24px page title,
and read as the loudest thing in the row even though it answers a
secondary question, not the screen's own name. A page-chrome count
renders at the same size as the labels beside it, never `--text-display`,
whatever it counts — the fix that redesign later made permanent by
moving this count off the toolbar entirely, onto its own card
(`Screen notes`' own Notions note, below).

**A card carries at most one `--text-display` number, mirroring the
one-accent-element invariant above (`Colour`'s own note).** Two
independent counts can legitimately describe the same card without ever
being compared to each other — Aujourd'hui's own course card, where a due
count and a below-target count answer two different questions and can
both be non-zero at once (`Aujourd'hui`'s own note, below). When that
happens, only one keeps `--text-display`: the one the card's own primary
action actually moves — the same digit a reader would expect to change
after pressing the button right below it. A second, non-actionable count
joins the card's plain-fact register (`text-sm`, no digit emphasis)
instead of contesting the first number's weight, the same tier this
app's other passive facts already use (a deadline, stated plainly, never
sized up). This ties two hierarchies that used to be decided separately
— which action is the card's own accent, and which number gets the
loudest read — into one rule with one criterion, not a fresh visual
judgement call for every future card. It does not apply to two numbers
deliberately paired for side-by-side comparison, never meant to be read
as competing facts about different questions — Progression's own
Coverage/Readiness gauges (`Progression`'s own note, below) are exactly
this: both stay `--text-display`, and any imbalance there is a spacing
question, not a hierarchy one. That screen's later redesign adds a third:
its own readiness ring duplicates the linear Readiness gauge's own number
rather than pairing with it — a deliberate restatement of one fact, not a
second fact to weigh against the first, so it stays outside this rule for
the same reason the paired gauges already do.

**Neither the display face nor any of these four sizes ever actually
rendered, from the very first commit of this pass until it was found and
fixed.** `font-[var(--font-display)]` and `text-[var(--text-*)]` both
compiled — silently, no build error, no lint warning — to the wrong CSS
property: Tailwind's arbitrary-value syntax is ambiguous for both prefixes
(`font-` could mean family, weight, or style; `text-` could mean colour,
size, or line-height), and without an explicit type hint it guessed wrong
both times, `font-weight` and `color` respectively. Every title sat in
Inter (the body face) at whatever weight `font-extrabold` gave it, and
every one of these four sizes rendered at the browser's own default,
never its own token — the numbers in this table were correct on paper and
absent on screen, the entire time. Confirmed against the real Tailwind
compiler, not assumed: `font-[family-name:var(--font-display)]` and
`text-[length:var(--text-label)]` (the type-hinted forms Tailwind actually
needs) now hold every call site in the app, checked by
`apps/web/src/styles/tailwind-type-hints.unit.test.ts`, which compiles
every such class through Tailwind itself and asserts the property it
produces — the class-name-string assertions every other test here used
instead could not have caught this, and did not, through the entire Type
pass and everything built on it since.

Four of the seven steps the original 12/14/16/20/24/32/44 scale listed, each
now named for its job instead of left as a bare number. 16, 24 and 44 stay
exactly as they were — Tailwind's own `text-base` (unused after this pass),
every screen's own `<h1>` (`text-2xl`, 24px, untouched), and the responsive
32-on-mobile/44-on-desktop title size this document once described but no
screen has ever implemented (still true after this pass; not this task).
One consequence worth naming rather than leaving surprising: a card's own
`--text-display` number (32px) can end up larger than the page's `<h1>`
above it (24px) — correct, not a bug. Dominance here is relative to the
number's own line and card, not a competition with the screen chrome.

### Shape and depth

- Radius: 8px on buttons and inputs, 12px on cards, 16px on large panels, full on
  avatars and chips.
- Shadow: `0 1px 2px rgba(16,24,40,.05)` at rest, `0 4px 12px rgba(16,24,40,.08)`
  on hover for interactive cards. Never more than these two.
- **Three named spacing steps** (`tokens.css`'s `--space-*`), each tied to a
  relationship rather than left a bare number — the same "name the step for
  its job" move `Type`'s four size tokens already made, applied here to the
  gaps between things instead of the size of text:

  | Token | Size | Between |
  |---|---|---|
  | `--space-related` | 8px | Elements that read as one unit: a form label and its input, an icon and its own button label, a checkbox and its text. |
  | `--space-block` | 16px | Distinct blocks sharing one section: cards in a grid, rows in a list. |
  | `--space-section` | 24px | A section and the next: a screen's title and the content below it. |

  Three of the base scale's seven steps (8, 16, 24) already carried almost
  exactly these roles before this pass, as `gap-2`, `gap-4`, and `gap-6`/
  `mb-6` respectively — naming them changes very few actual values, mostly
  the odd ones out repaired to match rather than a wholesale rewrite. 4, 12,
  32 and 48 stay unnamed and available for a genuinely finer or coarser
  need — a card's own internal title-to-body-to-actions rhythm keeps its
  existing 12px (`gap-3`) untouched, deliberately not folded into either
  named neighbour: tighter than two peer cards in a grid, looser than a
  label and its input. `p-8` (32px, every screen's own outer page padding)
  and a `Card`'s own `p-4` interior padding are a different concern than
  either — the edge of a container, not the space between siblings inside
  one — and are likewise untouched. Be generous regardless: the reference
  layout breathes, and cramming content is the fastest way to lose the look.
- **Every gap chosen next to a `--text-title` or `--text-display` element
  was re-checked against real rendered sizes, not against the three tiers
  above.** The tiers themselves hold — this recalibration pass didn't
  touch what `--space-related`/`--space-block`/`--space-section` mean, only
  which one (or which unnamed value) applies right beside a large type
  element. The reason: every one of these specific gaps was originally
  chosen while `Type`'s own sizes were silently failing to render (the
  Tailwind arbitrary-value bug, `Type`'s own note above) — a title next to
  a "32px" number was, in the browser that picked the gap, a title next to
  browser-default text. Four gaps turned out to be wrong once the real
  sizes were checked on screen, not assumed: a course-progress card's two
  gauges (`Progression`'s own note, below) sat only 12px apart, the card's
  ordinary internal rhythm, when two 32px numbers wanted more air between
  them than a title-to-label step does — now 16px (`--space-block`),
  title→gauge and gauge→status left at 12px, where a label already
  buffers the jump. A notion card's own title and difficulty label had no
  gap between them at all — invisible when the title rendered as plain
  text, a visible defect at real 20px bold — fixed at the time to
  `--space-related` (8px); moot since Notions' later redesign dropped the
  difficulty label from this card entirely (`Screen notes`' own Notions
  note, below). Lecteur's own document title and the course content
  beneath it (`Lecteur`'s own note, below) likewise had no gap at all —
  now `--space-section` (24px), a page-title-to-content boundary, the same
  relationship every other screen's own `<h1>` already has to what follows
  it. Notions du cours' own "Régénérer les fiches" block sat an identical
  24px from both the header above it and the notion list below it — two
  equal distances read as belonging to neither, so the block→list side
  tightened to `--space-block` (16px) at the time; superseded since by a
  uniform `--space-block` throughout that column (`Screen notes`' own
  Notions note, below).
  Checked against a static mockup built from these real token values
  before any of the four were decided, not assumed from the reasoning
  alone — the lesson of the four-commit type-hint bug (`Type`'s own note
  above) is that reasoning about what a rendered size "should" look like,
  on this codebase, has already been wrong once at real cost.
- **A list that could grow without bound gets a bounded, scrollable panel
  inside its card, never an ever-taller card.** Concretely: Aujourd'hui's
  own todos checklist (below). Four conditions, together, or it is not
  this pattern: (1) the panel caps only the list itself, never the card
  around it — a header, a section label, or a form beneath it stays
  outside the scrollable region, always visible; (2) the boundary shows a
  partially-cut entry, never a fade gradient and never a "+N" counter — a
  visibly clipped row is what tells a reader there is more, and neither of
  the other two says that without being read; (3) it never removes an
  entry from the page — every row stays mounted and reachable by Tab, the
  browser's own native scroll-into-view carries a keyboard user past the
  fold with no extra wiring, and nothing here is `tabindex`-trapped; (4)
  every item is already in memory, nothing loads as the reader scrolls —
  the one thing that would make it the infinite scroll `Forbidden` (below)
  actually bans. A grid's own `items-stretch` (`Aujourd'hui`'s own "One
  grid, not two" note, further below) is what makes this necessary at
  all: without a cap, a long list would keep growing exactly as tall as
  it needs, stretching whatever card happens to share its row along with
  it — see the next note here for why a wider card is not the answer
  either.
- **Aujourd'hui's own grid used to strand its todos card alone in a row,
  its column neighbour visibly empty — no longer patched by widening the
  card.** The previous fix here made the todos card span both grid columns
  whenever the course-card count was even (`lg:col-span-2`), so it would
  never sit alone beside an empty cell. That widened card exposed a
  different defect instead: its own two collapsed triggers ("Ajouter un
  todo" / the photo picker, `Aujourd'hui`'s own note below) are two
  buttons of very different widths, sized to their own text, and a card
  twice as wide left most of that width empty beside them — the same dead
  space, simply moved from beside the card to inside it. Stretching those
  buttons to fill the extra width was considered and rejected: it would
  size a plain secondary trigger to whatever the card's column-span
  happened to be that day, the same "gabarit follows a moment's content"
  mistake this whole pass exists to remove, just aimed at a button instead
  of a card. The todos card now **always** occupies exactly one grid
  column, the same footprint as a course card — it is one, in every way
  this grid can see. An even course-card count leaves the neighbouring
  cell empty; the same tolerance `Mes cours`' own document grid already
  extends to an incomplete last row, not a stranded, always-present
  companion card that needs artificial widening to look intentional.
- **A form or list that is not already sized by a card or a grid column
  never stretches to the bounded column's full width.** Cap it at a
  reasonable width instead (448px, Tailwind's `max-w-md`, is the default
  absent a better reason). When it *is* a grid item or lives inside a card,
  the card/column already gives it a sane width — no separate cap needed,
  and stacking one on top of the other (a cap inside a card already capped
  by its grid column) only makes it narrower than its neighbours for no
  reason.
- **Two or more trigger buttons at the same level share the same width,
  never sized to their own label alone.** Found on Aujourd'hui's own todos
  card: "Ajouter un todo" and "Ajouter depuis une photo" are a matched pair
  of collapsed triggers, stacked, but sat at two different widths because
  each sized itself to its own text. Wrapped in a single-column
  `inline-grid` (not `w-full`, which would stretch both to the width of
  whatever container they happen to sit in — the same "gabarit follows the
  container, not the role" mistake the bullet above already rules out for
  a form, just aimed at a button pair here): the container itself shrinks
  to the widest label's own natural width, and the default CSS Grid
  stretch (`justify-items: stretch`, nothing to opt into) makes the
  narrower button match it — neither wider than it needs to be, both the
  same. The only pairing in the app today; written as a general rule
  because a second one will eventually need the same fix, not because
  there are two yet.
- **A trigger-revealed area is always closable without submitting, and
  that close action is reachable by keyboard.** Found missing on both of
  Aujourd'hui's own todos-card triggers: the add-todo form's Escape
  handler existed with no visible button beside it (closeable only by a
  shortcut nothing on screen suggested trying), and the photo picker had
  no way to close at all short of picking a file or reloading the page.
  Three mechanisms exist in this app for what a trigger reveals; which one
  applies depends on whether there is a draft worth returning to:
  - **The trigger becomes the close action** (`NotionsScreen`'s own "Voir
    le contenu" / "Masquer le contenu"). Fits a read-only reveal: the same
    single control toggles both ways because both states are the same
    *kind* of thing, one line of text either shown or hidden. Does not fit
    a form or a file picker — a button flipping into a set of fields isn't
    the same kind of control any more, so it cannot also double as its own
    closer the way a text toggle can.
  - **"Annuler"** (`UploadCard`'s own confirm step, `Progression`'s
    deadline form) — the revealed area unmounts and does not keep its own
    state alive anywhere else: reopening starts genuinely fresh. Right
    when there is nothing worth returning to — staged files or a
    half-typed deadline edit are meant to be redone, not resumed.
  - **"Fermer"** (Aujourd'hui's own add-todo form) — the area still
    unmounts, but its draft already lived one level up, in the parent, not
    inside the component that just disappeared (`Aujourd'hui`'s own note):
    reopening shows the same non-empty draft, not a blank form. Right when
    closing by mistake, or to glance at something else, should not cost
    someone what they had already typed. The photo picker gets this same
    label and the same disabled-while-in-flight treatment `UploadCard`'s
    own "Annuler" already uses, even though it holds no text draft to
    preserve — consistency between the card's own two triggers matters
    more here than a label chosen for a distinction with nothing on the
    other side of it.
  Either way, Escape does exactly what the visible button does — never a
  keyboard-only path with no on-screen equivalent, which is the actual
  defect this note exists to close.
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
- **A toolbar mixing one screen-level action with navigation to other
  screens demotes the navigation, it does not wrap or shrink the
  action.** Found on Notions' own toolbar, before its later redesign:
  "Lire le cours" / "Voir la progression" / "Réviser" sat as three
  `Button`s of identical weight, and at 375px the row didn't fit — three
  bordered buttons plus a count, unwrapped. Stacking the buttons or
  shortening their labels were both rejected: the actual defect is that
  nothing on screen said which of the three mattered most, the same
  "identical weight, one is supposed to dominate" mistake `Aujourd'hui`'s
  own course-card buttons already had and were fixed for. The two
  navigation actions demoted to a plain underlined link, the same idiom
  `Forbidden` already uses for every other secondary or destructive action
  in this document — narrower than a bordered `Button` by construction,
  which is what actually closed the 375px gap, not a media query
  reshuffling the same three buttons. **That redesign later took this one
  step further: the toolbar's own "Réviser" moved off the toolbar
  entirely**, onto its own accent button on the course summary card
  (`Screen notes`' own Notions note, below) — today's toolbar
  ("Lire le cours" / "Voir la progression" / "Discuter du cours") is three
  plain links and nothing else, not one Button demoted down to two.

### Icons

`lucide-react`: a single coherent stroke-based set (~1500 icons, one visual
grammar — uniform stroke width, corner radius, viewbox — unlike `react-icons`,
which bundles several unrelated icon families behind one package), rendered
as individual React components (`import { BookOpen } from "lucide-react"`),
one named import per icon actually used — real tree-shaking, not a sprite
sheet or an icon font. It is also shadcn/ui's own default companion: this
app's component base (`For agents`, below) already carries
`class-variance-authority` + `clsx` + `tailwind-merge`, the rest of that same
standard pairing, in `apps/web/package.json` — picking a different set here
would run a second icon grammar alongside the one shadcn's own generated
components already assume.

**Size and stroke are tokens, not per-call numbers.** Two sizes, one stroke
weight, exported once from `apps/web/src/lib/icons.ts` and imported at every
call site — `ICON_SIZE_INLINE` (16px), paired with a button or card-action
label at body text size, and `ICON_SIZE_NAV` (20px), for the sidebar/tab-bar
destination icons, which sit at a larger, more prominent scale of their own;
`ICON_STROKE_WIDTH` (2, the library's own default, named explicitly rather
than left implicit) for both. These live as exported TS constants rather
than `tokens.css` custom properties: Lucide takes `size`/`strokeWidth` as
component props, not CSS properties, so a constant module is the natural
token form here, the same "defined once, referenced everywhere, never
duplicated ad hoc" discipline `tokens.css` already enforces for colour and
type.

**An icon accompanies its label, never replaces it — no icon-only button
anywhere in this app** (`Forbidden`, below, already bans one without an
accessible label; this goes further and keeps the label itself always
visible). Every icon is `aria-hidden="true"` and `focusable="false"`,
exactly like the mascot: the accessible name of a nav destination or a card
action is its text label alone, unaffected by the icon beside it.

**One exception, and it stays an exception: ReviewScreen's graded-MCQ
`Check`/`X`.** Every icon above is redundant with a label already on
screen — that's what lets it stay purely decorative. Those two are not:
each marks a fact — "correct answer", "your pick" — attached to one
specific option, that nothing else on screen says for that option. Their
SVGs stay `aria-hidden` same as any other icon here (shape alone still
carries nothing a screen reader can use), but each is paired with its own
`sr-only` text rather than a second visible label (`Colour`'s own note
above has the full reasoning).

**Scope for this pass**: one icon per nav destination (`Home` for
Aujourd'hui, `BookOpen` for Mes cours, `Layers` for Notions (M9 — distinct
from `BookOpen`, a course's atomic units rather than its catalogue entry),
`BookOpenText` for Lecteur (M9 — the same icon this section already gives
"Lire le cours" on a card, reused rather than invented since it is the same
destination), `TrendingUp` for Progression, `Calendar` for Calendrier,
`MessageCircle` for Tuteur — plain and literal, matching the rest, not
`Bot`: the mascot section's own "Fiche is a tool, not a friend, never a chat
persona" already argues against a nav icon that reads as an anthropomorphic
AI), and
on each card's own primary, forward-moving actions — the ones docs/UI.md
already calls "a path to action" on Aujourd'hui's own course card:
`BookOpen` for "Voir le cours" (Calendrier's own day panel, landing on
that course's Notions), `BookOpenText` for "Lire le cours" (a distinct
destination, the continuous-reading Lecteur), `Repeat` for "Réviser",
`CalendarClock` for setting or updating a deadline, `RotateCw` for a
single failed document's own "Réessayer", `Upload` for UploadCard's
"Créer le cours". Never on a card's dismissive or destructive
action — "Supprimer", "Supprimer l'échéance", "Annuler", "Régénérer les
fiches", "Voir le contenu"'s expand toggle: these are already visually
demoted (a plain underlined `<button>`, never the `Button` component) or
already named as destructive/secondary in this document or in code
comments, and adding an icon would raise their visual weight in exactly the
direction the demotion was deliberately fighting.

Not extended to `Calendrier` (a day cell, not a course card — the same
reasoning `Subject colours` already gives for why that screen's colour
treatment stops there too) or to `Révision` (grading controls, not a
course-card grid). `Lecteur`'s own later redesign (`Screen notes`' own
Lecteur note, below) is an exception carved out since: its pill selector
reuses `NotionsScreen`'s own `CoursePill` (`BookOpen` beside each course's
title, the same nav-destination icon), and its "Étudier ce cours" panel
puts `Layers`/`MessageCircle` on its own two buttons — the same icons the
nav already assigns to Notions/Tuteur, reused for the same destination
rather than invented, each button living inside its own `Card` so the
"actions of a card" boundary below still holds. `NotionsScreen`'s own
toolbar ("Lire le cours" / "Voir la progression" / "Discuter du cours",
`Screen notes`' own Notions note below) is plain page chrome, not inside a
`Card`, so it is out of scope by the same "actions of a card" rule that
puts an icon on that screen's per-notion `Card`'s own "Réviser" instead —
the rule's boundary is structural (inside a `Card` or not), not about
colour or weight, and holds more simply today than it once did: the
toolbar carries no accent button of its own any more to reconsider
against (that action moved onto the course summary card, its own `Card`,
`Colour`'s own note above) — it is three demoted plain links and nothing
else, answered the same way `Forbidden`'s neighbouring list already does
for every other demoted plain link in this document, an icon on any of
them raising their weight back up in exactly the direction that demotion
exists to avoid. `ProposalsScreen` (reviewing photo-derived
todo proposals) was not addressed — tangential to this four-commit visual
pass, not one of the screens it has touched so far; flagged rather than
silently included or excluded by assumption.

Icons do not yet unlock the Tablet section's own 72px icon-only sidebar
collapse (below): that mode also needs tooltips standing in for the hidden
labels, a new interaction pattern this pass does not introduce (`For
agents`' own "stop and ask" rule). The sidebar still keeps its full 240px
width through the tablet breakpoint for now.

### Motion

150 to 200ms, ease-out. The review card flip is the one orchestrated moment.
Mascot animations are idle-only and subtle. `prefers-reduced-motion` disables the
flip and all mascot motion.

**Progression's own gauges and readiness ring are a second, deliberately
longer exception (`Screen notes`' own Progression note, below): 700ms
ease-out, a one-time entrance read on mount, not a response to a
click.** `motion-reduce:transition-none` respects a reduced-motion
preference the same way the flip and mascot motion are meant to, jumping
straight to the real value instead of animating toward it.

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
icon-plus-label items, the active item in `--primary`. "Permanent" means
pinned to the viewport, not just always-rendered: it stays on screen while
a long page's own content scrolls past it, the same way the mobile tab bar
already stays fixed to the bottom — a page taller than the viewport (a
long course in Lecteur, a long list on Mes cours or Notions du cours) must
never carry the sidebar away with it. Content area on `--canvas` with 32px
padding, its content capped at a max-width of 1152px and centred — cards,
forms and text never stretch to the edge of a wide viewport. Top row of
the content area holds search on the left, and notifications plus the
user chip on the right.

**Tablet** — Sidebar collapses to 72px, icons only, labels as tooltips.

**Mobile** — Sidebar becomes a bottom tab bar. Search moves into the header.
The user chip moves into the header. Multi-column card grids become a
single column.

**Not yet built, disclosed rather than silently skipped:**
- **The tablet 72px icon-only collapse.** Nav items now carry an icon
  (`Icons`, above), but the collapse itself still needs tooltips standing
  in for the hidden labels — a new interaction pattern, out of scope for
  the pass that added the icons themselves. The sidebar keeps its full
  240px width through the tablet breakpoint for now — it only becomes the
  mobile bottom bar below 768px.
- **Search and notifications.** Neither exists yet. The content area's top
  row currently holds only the user chip (greeting and sign-out).
- **The secondary group.** Mes notes and Réglages have no screen at all
  yet (no module built past its own spec in `docs/modules/`). The
  persistent nav — sidebar and bottom bar alike — renders only the seven
  real destinations below; there is no divider, no secondary group, and no
  placeholder standing in for what isn't built. Seven destinations is now
  both the target and what exists (M9 adds Notions and Lecteur to the five
  M8 already reached).

### Navigation

Primary (bottom bar on mobile, top group in the sidebar):

- **Aujourd'hui** — home
- **Mes cours** — documents, upload
- **Notions** — a course's atomic notions, generation, review entry point
- **Lecteur** — a course's source text, read continuously
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

**Notions and Lecteur (M9) are grouped beside Mes cours, in that order, not
scattered to match some other logic** — the three together are "the course",
read at increasing depth: the catalogue, then a course's own atomic units,
then its full source text.

**Lecteur kept the dual-entry shape `Tuteur` established, until a later
pass unified it with Notions' own pill selector instead, ignoring
`docs/UI.md` per the user (`Screen notes`'s own Lecteur note, below,
describes the replacement in full).** Reachable directly from the nav
with no course chosen: instead of landing on a `Mes cours`-shaped picker
list, it lands straight on its own pill row of courses (the first one
selected) plus that course's own reading surface and "Étudier ce cours"
panel — one page, not two, the same unification Notions went through
first. There is no `fromPicker` field on its view shape any more (removed
along with the picker it once distinguished from) and no "which of several
sources" problem left to solve for that case: a `documentId` still
pre-selects a course from any existing deep link (a course's own card on
`Mes cours`, `Notions du cours`' own toolbar) and shows "Retour"; its
absence (the nav's own direct entry) shows the first course with no back
link at all, matching Notions/Aujourd'hui/Mes cours' own top-level pages.
`Tuteur` is the one dual-entry-with-a-picker screen left (`Screen notes`'s
own Tuteur note, below, still describes that mechanism in full).

**Notions dropped the picker entirely in a later pass, ignoring
`docs/UI.md` per the user (`Screen notes`'s own Notions note, below,
describes the replacement in full).** Reachable directly from the nav
with no course chosen: instead of landing on a `Mes cours`-shaped list,
it lands straight on its own pill row of courses (the first one selected)
plus that course's own summary and notion list — one page, not two. There
is no `fromPicker` field on its view shape and no "which of several
sources" problem to solve for it any more: a `documentId` still pre-selects
a course from any existing deep link (Progression, Calendrier, Lecteur/
Tuteur's own "Retour" targets) and shows "Retour à mes cours"; its absence
(the nav's own direct entry) shows the first course with no back link at
all, matching Aujourd'hui/Mes cours' own top-level pages — never a second
screen to return to.

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

**Connexion** — Never specified until now; unstyled HTML since M1. The one
screen with no persistent nav (`App.tsx` renders it standalone, before
`AppShell` mounts): a centred card, capped at `max-w-md` (Shape and depth's
own default absent a better reason), on `--canvas`. Two fields, each
labelled above its input, not beside it — the same label-and-`FIELD_CLASS`
treatment as Aujourd'hui's own add-todo form, not a new pattern. The
identifier field gets focus on mount, the same ref-plus-effect idiom
Aujourd'hui's disclosed add-todo form already uses (not the bare
`autoFocus` attribute); Enter submits, the ordinary behaviour of a real
`<form>`, nothing extra needed for it.

Login-only, no self-signup (`docs/modules/identity.md`, `README.md`):
every account is created, or reset, by an administrator from the CLI, so
this screen has nothing to register and never offers to.

**"Se connecter" is `--primary`, in its accent role, and this is one of the
few places in the app where that is actually earned:** a single focused
screen with exactly
one action, the same shape as ReviewScreen's session-end/post-grade
buttons and UploadCard's "Créer le cours" — not one of several peer actions
competing for the same weight, the mistake corrected on NotionsScreen's
own toolbar. `Colour`'s own accent note above still applies here at its
strictest: a single-purpose screen, not a card grid, so its whole surface
is the "one card" the rule counts against.

Not the four-state shape (`Required states` above): this screen loads no
data to display, so there is no "empty" state to speak of. Instead:
**ready** is the form; **submitting** disables the button (`Button`'s own
`disabled:opacity-50`, no separate loading style needed) and relabels it
"Connexion en cours…"; **error** is a plain inline fact next to the field,
`role="alert"`, no mascot — too small and too focused a screen for one,
the same call UploadCard's own inline errors already make — in the same
register as everywhere else in this document, never a raw status code:
wrong credentials, rate-limited, and the server being unreachable, three
distinct messages. The third was a real gap this note's own audit found,
not a hypothetical: the previous version never caught a rejected login
request at all and got stuck on "Connexion en cours…" forever, silently.

**Aujourd'hui was rebuilt from a user-supplied mockup (2026-09-06),
replacing everything this section used to describe, ignoring several of
this file's own rules below — each one named where it applies.**
`TodayScreen.tsx` is the whole of it; the streak, previously this screen's
own card, now lives in `AppNav`'s sidebar instead (`Navigation`'s own
note, above) and is visible from every screen, not only this one
(`Copy`'s own note, above). This note is the reconciliation this section
owed `docs/UI.md` since that pass — nothing above the header note is
stale any more.

**Header.** A full-width block, its own top edge lining up with nothing
beside it: the date ("Dimanche 6 septembre", capitalised, `fr-FR`
long-weekday/day/month format) in `--primary`, then "Bonjour, {username}"
at `--text-display`, then one sentence — "Tu as **N fiche(s)** à réviser
dans M cours. 25 minutes de concentration suffisent pour garder de
l'avance." when at least one card is due, or "Rien à réviser pour
l'instant. Profites-en pour avancer sur autre chose." when none is.
Nothing here renders before the first `GET /api/today` response lands —
this block has no loading state of its own.

**Loading and error are a plain text line, not this file's own
skeleton-and-mascot pattern, and the empty case shows nothing at all —
three real gaps against `Required states` above, not considered
exceptions.** While pending: `<p>Chargement…</p>`. On error:
`<p role="alert">Impossible de charger ta journée. Vérifie ta connexion et
réessaie.</p>` — no skeleton shape, no mascot, on either. When no course
has anything due: the "À réviser aujourd'hui" section simply does not
render — no mascot, no invitation, no fallback message of any kind,
unlike the `sleeping`-mascot empty state this section used to describe.
Flagged here rather than left to look intentional; closing this gap is a
distinct, not-yet-scoped task.

**Two independent layouts side by side, not one shared grid.** A left
column (`flex-1`) stacks the due-course grid and the todos card; a fixed
300px right column stacks Pomodoro and the study-sounds card (below).
Nothing from `items-stretch`, row-matched card heights, or a todos card
"pinned" relative to course cards in one grid still applies — the two
columns don't share rows at all.

**One heading, "À réviser aujourd'hui" (a `Calendar` icon plus the label),
over a grid of course cards, two columns from 640px up — only when at
least one course has a due count.** Unlike the design this replaces, a
course below its exam target with nothing actually due does **not** get a
card here any more: `TodayView.notionsBelowTarget` still flows into
`buildCourseCards`' own `belowTargetCount` field, but nothing in the
current `CourseCard` reads it — the "X notion(s) à consolider avant
l'échéance" sentence this file used to describe is gone from the screen
entirely, not merely restyled or moved. Cards are still ordered by
`deadline?.daysAway ?? Infinity`, ascending, unchanged.

**A course card's own icon sits in a colour-tinted circle, not the
left-border treatment `Subject colours` describes — a knowing departure,
per the user's own mockup, shared with `Mes cours`' own card (below,
which explains the same choice once, not repeated here).** Always
`BookOpen`, tinted by `document.colour`; a course with no colour (reached
only through a deadline, same as before) tints nothing.

Each card, top to bottom: the icon circle and title on one row; then, on
one row together, either the due count at `--text-display` — coloured by
the course's own colour, not plain text — with "fiche(s) à revoir" beside
it, **or**, once nothing is due, a `--success` check icon and "Tout est à
jour" (never both, never a due branch left showing "0"), plus a deadline
badge when the course has one (`countdownLabel`'s relative wording,
`bg-warning/10 text-warning`, unchanged); then one full-width action at
the card's own bottom — "Réviser" (accent) above zero due, a disabled
"Rien à réviser" at zero. `Colour`'s own "one accent element per card"
invariant still holds; there is only ever the one button to police now.

**The card's second action — "Voir le cours", opening a course without
reviewing it — no longer exists, on this screen alone.** Confirmed with
the user (2026-09-06) as an intentional cut, not a bug or an oversight.
Once every due card for a course has been reviewed, nothing on its card
reaches that course's own
Notions, Lecteur or Progression any more — only the nav's own
destinations do. `Mes cours`' own card (below) kept its equivalent, "Lire
le cours": the two cards are no longer symmetric on this one point.

**One todos card**, close to its previous shape: a header row ("Todos", a
`ListChecks` icon) carrying a live "N restants" count and two triggers,
the checklist below, then at most one revealed form (add / photo),
collapsed by default.

**The two triggers are icon-only — a second knowing departure, against
`Icons`' own "an icon accompanies its label, never replaces it" rule
above.** "Ajouter depuis une photo" (`Camera`) and "Ajouter un todo"
(`Plus`) are each a plain filled circle (`bg-primary-soft`/`text-primary`)
carrying no visible text at all, only an `aria-label` — `Forbidden`'s own
"icon-only buttons without an accessible label" line still holds (there
is one), only `Icons`' stricter rule does not. Both hide once either form
is open.

**A todo row's own bullet is a custom round checkbox, not the browser's
native square one** — still a real, keyboard- and screen-reader-operable
`<input type="checkbox">` under the paint (`appearance-none` strips only
the default rendering), a white ring unchecked, a filled `--success`
circle with an inline SVG checkmark once checked. A small course-coloured
dot beside a linked todo's own row stands in for naming the course in
text. The add form (label required; date and course, both optional —
nothing else) and the photo picker (one file input, "Photo de l'agenda")
are otherwise unchanged from before: both close on Escape or their own
"Fermer", the add form's draft survives a close/reopen, the photo picker
has nothing to preserve.

This screen still has no "Retour" — the nav's own "Aujourd'hui" leads
here from anywhere, and "Mes cours" is the app's other home.

**Aujourd'hui — pomodoro (M7).** Still its own block, now living in the
fixed-width right column above the study-sounds card rather than spanning
full width below a shared grid — the surrounding layout changed, its own
three states did not: **Repos** (an optional todo `<select>`, "Démarrer"),
**En cours** (a countdown, "sur « {todo} »" when a todo is linked,
"Terminer"), and ending a session now returns straight to **Repos**
instead of a separate **Juste terminée** confirmation line.

**"Recorded" (`docs/MILESTONES.md`'s M7 acceptance) is now a session
counter, not a confirmation sentence.** "N séance(s) de concentration" sits
inside the countdown ring at every phase and increments each time a
session ends; "Réinitialiser" clears it back to zero (disabled while a
session runs, or already at zero). Client-only, resets on reload — the
same "nothing to remember this milestone" reasoning the old confirmation
line carried, just moved to a running count instead of a one-off
sentence. "Pause courte"/"Pause longue" are two more purely decorative
tabs beside "Concentration", new since this file was last accurate: the
backend still has exactly one fixed duration, nothing lives behind
either one.

**A pomodoro session is no longer linked to a specific todo.** The "Todo
(facultatif)" select this file used to describe is gone; `startPomodoro`
is now called with no todo, unconditionally. Confirmed with the user
(2026-09-06) as an intentional cut, not a bug. Everything this file said
about a linked todo's own label appearing
mid-session, or falling back cleanly once deleted, no longer applies —
there is no linked todo to show or fall back from. The zero-colour,
no-escalation countdown itself, and `POST /api/pomodoro`'s 409-as-resync
handling ("Une séance est déjà en cours.", no `--warning`, no retry
button), are both unchanged.

**Aujourd'hui — Spotify (M7) has been removed entirely, not merely
restyled.** Confirmed with the user (2026-09-06) as an intentional cut,
not a bug: no card, no "Écouter" trigger,
no iframe, anywhere in the current build, and no `frame-src` CSP entry
either — everything this file used to say about the embed (the hardcoded
playlist URL, the no-iframe-before-click guarantee, the CSP grant)
described a real, shipped feature that no longer exists. Building it
again starts from zero, CSP included, not from restoring a hidden block.

**Aujourd'hui — study sounds, new, mock only.** A card beside Pomodoro in
the right column (`data-testid="study-sounds-card"`): a track/playlist
line, a fixed-position progress bar, transport controls and a volume bar,
a two-row "up next" list. None of it is wired to real audio — the
controls carry accessible labels but no handlers, the progress fill and
times are hardcoded. Disclosed the same way this file discloses other
not-yet-built pieces elsewhere (`Layout and responsiveness`'s own list,
above): a placeholder for a feature that does not exist yet, not a
finished one.

**Mes cours was redesigned from a user-supplied mockup (2026-09-06),
ignoring this file's own former "card grid, cover or subject-coloured
header, progress ring" description below in full — nothing from it still
applies.** The mockup also showed several distinct "materials" (separate
uploads — a PDF, a second PDF, a photo) grouped under one course card,
with its own panel to add more material to an existing course later —
that grouping does not exist in this app: a course is still exactly one
upload (one title, one page set, one `documents` row), a scoping decision
made with the user rather than building a new grouping entity, a new
route, and a schema change into what was meant to be a front-end pass.

**A persistent two-column layout, not a grid**, in every state alike
(loading/error/empty/ready) — a `flex-1` column of course cards, stacked
vertically one per row, beside a fixed 320px `UploadCard`, always open,
never a floating button or a toggle to reveal it. No cover image, no
progress ring: each course's own numbers render as a plain stats line
instead (below).

**A course card's own icon sits in a colour-tinted circle, not the
left-border treatment `Subject colours` describes — a knowing departure,
per the mockup, shared with Aujourd'hui's own course card (above, which
explains the choice once).** Top row: the icon circle, the title, a
deadline badge when the course has one (`countdownLabel`'s own relative
wording, unchanged from Aujourd'hui's), and a delete action (a plain
`Trash2` icon, accessible label naming the course, no confirmation
modal). Below: page count; while extraction is running, only its status
label (`en attente`/`en cours`/`échec`, `Réessayer` on failure); once
`done`, real per-course numbers instead — "N notion(s) · M maîtrisée(s) ·
**K à réviser**" (`GET /api/documents/:id/progress`, the same
`["today"]`-sourced due count Aujourd'hui's own card reads) — and one
material chip naming that same document's own title and page count, kept
for the multi-material mockup shape described above even though today it
is always redundant with the card's own title, since one course is still
exactly one upload. **Unlike
Aujourd'hui's own card, this one keeps two actions once done, not one**:
"Réviser" (accent, above zero due) or a disabled "Rien à réviser", *and*,
always, a tinted "Lire le cours" beside it — the one place the two
screens' otherwise-matching cards still diverge (Aujourd'hui's own note,
above, names this explicitly). "Voir les notions" no longer exists on
this card at all: Notions is reached through the nav instead (below).

**A course's own "Terminé" status label is written but never actually
reachable — dead text, not a display bug worth chasing without being
asked.** `STATUS_LABEL.done` exists in code but the branch that would
render it only fires while `status !== "done"`; once a document is
actually done, the stats-line branch above renders instead and no
"Terminé" text appears anywhere on the card. `pnpm test:e2e`'s own specs
now wait on the "Lire le cours" button appearing as their real done-signal,
not on this text.

**Mes cours has its own real four states** (`Required states`, above,
followed in full here, unlike Aujourd'hui's own gaps, above): a skeleton
of three pulsing card-shaped blocks while loading; `Confused` plus a
retry button on error; `Reading` plus "Aucun cours pour l'instant. Prends
ton cours en photo pour commencer." when the list is empty — `UploadCard`
itself stays visible beside all four, since it is not part of what is
loading.

**`UploadCard` is always open, ignoring this file's own former
click-to-reveal toggle.** A real HTML5 drop zone ("Dépose un fichier ou
clique pour parcourir", accepting PDF/Word/PowerPoint/JPG/PNG/WEBP up to
20MB) doubles as the file input; staged files list below it, reorderable
and removable before submitting, each with an accessible label naming it
(the same idiom Aujourd'hui's own todo-delete action already uses); a
"Titre du cours" field; then "Créer le cours" (accent, disabled until at
least one file is staged) — renamed from "Confirmer", the same word
through the whole flow `Copy`'s own rule above asks for.

**Notions was unified into one page from a second mockup, later still,
ignoring this file's own former picker-plus-course-view description below
in full.** `Navigation`'s own note (above) already describes what changed
at the nav-entry level;
this note describes the page itself.

**One page: a pill row of every course, then that course's own summary
and notion list — no separate picker to leave.** Lecteur went through the
same unification in a later pass (`Screen notes`' own Lecteur note,
below); Tuteur is the one screen left with a separate picker page
(`Navigation`'s own note, above). Each pill: `BookOpen` plus the course's own title,
filled `--primary`/white when active, plain otherwise — no left-border or
tinted-circle treatment here, a plain filled/outline toggle instead.
Switching pills is a local selection, not a navigation; the selected
course's own local UI state (an expanded notion body, the generation
form) resets on switch (a `key`-based remount), never leaks from the
course shown before.

**The selected course's own summary card**: icon circle (Aujourd'hui/Mes
cours' own tinted-circle treatment again), title as an `<h2>` (this
page's own `<h1>` stays "Notions", never duplicated), "N notion(s) · M
maîtrisée(s) · **K à réviser**", and the page's one accent button —
"Réviser K fiche(s)" above zero due, a disabled "Rien à réviser" at zero.
This is now the *only* accent action on the page: the toolbar below it
("Lire le cours" / "Voir la progression" / "Discuter du cours") is three
plain underlined links, none of them a `Button` any more — the
"which of four is still accent" question this file used to answer at
length no longer has more than one candidate to weigh.

**"Retour à mes cours" sits above the summary card, its own line, flush
left, a plain underlined link — shown only when a `documentId` arrived
from an existing deep link (Progression, Calendrier, Lecteur/Tuteur's own
"Retour" targets); absent entirely on the nav's own direct entry**, which
shows the first course with nothing to go back to, the same as
Aujourd'hui/Mes cours' own top-level pages. There is no "Retour"-only
variant any more (the old `fromPicker` case) — the picker it once
distinguished from doesn't exist.

**A notion card**: title plus a status badge ("Maîtrisée"/"À réviser"/"En
apprentissage" — mastery wins even over a technically-due card, matching
`docs/modules/review.md`'s own example of a mastered notion still showing
a future review date) on one row with its own "Réviser" button (plain
`Button`, not the toolbar's demoted links); a one-line, plain-text body
preview (140 characters, truncated on word count only — markdown-aware
truncation was not worth it for a preview this short); five review dots,
filled up to the notion's own review count and coloured by the course's
own colour, plus "N révision(s)" and, only when relevant, "à réviser
maintenant" or "dans N jours"; a "Voir le contenu" toggle revealing the
full body as real rendered markdown. No difficulty label anywhere on this
card any more, and no "why isn't this mastered yet" sentence
(`cardsWithEnoughReps`/`cardsWithEnoughStability`, the whole "fiche(s)
agrees with the denominator" rule this file used to spell out at length)
— **this one is a real gap found while reconciling this file, not yet
confirmed with the user as an intentional cut, unlike Spotify, pomodoro's
todo-linking, and Aujourd'hui's own "Voir le cours" action above, all
three of which were.** Worth asking about before assuming it should stay
dropped.

Spacing throughout the selected course's own column is uniform
`--space-block` (16px) between every sibling — the back link, the summary
card, the toolbar links, the generation toolbar, the notion list — a
simplification from this file's former differentiated 24px/16px scheme,
which described a layout this redesign replaced.

**Upload** — Camera first on mobile, file picker first on desktop. Multi-page
capture is one document: several photos of the same lesson produce one course.
Thumbnails, reorderable and removable, before confirming.

**Révision** — Focused view: navigation dims but does not disappear, since sessions
are meant to be unhurried and leaving must never feel like a trap. One card at a
time, generous whitespace. Space to reveal, 1 to 4 to rate on desktop. Leaving
mid-session saves progress. No timer, no countdown, no "hurry".

**Progression** (M5: `progress` module — see `docs/modules/progress.md`) —
Redesigned from a user-supplied mockup in a later M9 pass, ignoring this
file's own former uniform-grid-of-cards description below in full, the
same unification Notions/Lecteur already went through for their own
screens. `Navigation`'s and `Subject colours`' own notes (above) already
describe what changed at the nav-entry and colour-rule level; this note
describes the page itself.

**One page: a pill row of every course (`NotionsScreen`'s own `CoursePill`
idiom, reused), then the selected course's own detail card, then a
compact "Tous les cours" list — no uniform grid of one full card per
course any more.** A `documentId` prop pre-selects a course from an
existing deep link (Notions du cours' own "Voir la progression"); its
absence (the nav's own direct entry) selects the first course, the same
`documentId ?? manualSelection ?? items[0]` idiom Notions/Lecteur already
use. Switching pills, or clicking a row in "Tous les cours" (below), is a
local selection, not a navigation — both change which course the one
detail card shows.

**The detail card, top to bottom, three stacked rows — not the ring
spanning everything beside it, this pass's first cut's own layout, nor a
single right-hand column the way that cut's own one follow-up left it.**
A second follow-up mockup moved the ring down to sit between "Couverture"
and "Préparation" rather than beside the header, so it now shares a row
with only the two gauges, vertically centred against them
(`sm:items-center`, not `sm:items-start`). The header row and the lower
row (stat tiles, actions) no longer have the ring beside them to align
against, so each instead opens with `RingSpacer`, an invisible `sm:w-
[140px]` column reserving exactly the ring's own width (`RING_SIZE`,
shared between the two rather than a second magic number) — the same
visual effect as sharing a row with the ring, without actually doing so.

1. **Header row**: `RingSpacer`, then the colour-tinted icon circle and
   the course's own title (`--text-title`) on one line, then, only when
   relevant, "Cette échéance est passée." or the recently-added-notions
   sentence (below).
2. **The ring's own row**: the readiness ring, then the two linear gauges
   (Coverage, Readiness) stacked beside it — the realignment itself.
3. **Lower row**: `RingSpacer`, then a mastered/learning/due/not-started
   stat row, four notions-level counts that partition the course's own
   notions (composed client-side from `GET /api/documents/:id/notions` +
   `.../notions-progress`, the same two reads NotionsScreen's own
   pill-selector redesign already composes for its own per-notion status
   badge — `notionBucket`, kept local to this screen, differs from that
   screen's own `notionStatus` in one way: a notion with zero cards gets
   its own "not-started" bucket here rather than being folded into
   "learning", since this row has room to distinguish it and that
   screen's badge does not); then one action row carrying all four of
   "Combler l'écart", "Voir le cours", "Définir une échéance"/"Modifier
   l'échéance" and, once a deadline exists, the delete icon together — a
   second follow-up mockup's own request, merging what this pass's first
   cut had as two separate rows (CTA/"Voir le cours", then deadline
   management below it).

**Every button on that merged action row**: "Combler l'écart" (`ArrowRight`,
`accent`, enabled whenever the due bucket is non-zero — the same
enabled/`disabled` "Rien à réviser" idiom NotionsScreen's own course
summary card already uses for its "Réviser N fiches"); "Voir le cours"
and "Modifier l'échéance"/"Définir une échéance" both `secondary` with
the same light `bg-primary-soft`/`text-primary` tint Lecteur's own
"Discuter avec le tuteur" and Mes cours' own "Lire le cours" already use
— plain bordered `secondary` for both in this pass's first cut, until two
separate follow-up requests added the tint to each in turn ("Voir le
cours" first, "Modifier l'échéance" in the same pass as the row merge);
then, once a deadline exists, a bare `Trash2` icon button, a follow-up
mockup's own request replacing the underlined "Supprimer l'échéance" text
link this pass's first cut had. The accessible name stays the literal
string "Supprimer l'échéance" (an `aria-label`, `Forbidden`'s own
"icon-only button without an accessible label" rule, below, satisfied
rather than violated), and the same low-visual-weight treatment every
other destructive action in this app already carries — just an icon
instead of underlined text now, not a `Button`, no border, no fill until
hovered (`hover:bg-canvas`, matching this card's other plain icon-adjacent
affordances). "Voir le cours" opens that course's own Notions du cours,
kept from the pre-redesign screen; not shown in any of this screen's own
mockup crops, an addition rather than a literal copy, so this is flagged
here as a judgement call, not a silent one. Every action here is
unchanged in mechanics from before this pass, simply relocated (twice
now) onto the one selected course's own card instead of every card in the
old grid.

**The readiness ring is decorative, `aria-hidden`, not a second
accessible meter.** It duplicates the same readiness value the linear
"Préparation" gauge right beside it already exposes with `role="meter"` —
giving the ring its own meter with the same accessible name would create
an ambiguous duplicate for both assistive tech and any test querying by
role and name; the number is still there as plain, readable text either
way. Its own caption reads "Préparation à l'examen", visually distinct
from the linear gauge's plain "Préparation" label a few pixels below it,
matching the mockup's own deliberate repetition of "Exam readiness" — a
hero number, then the same fact again as supporting detail.

**Every indicator on this screen loads from 0 to its real value — a
follow-up mockup's own request, an addition to `Motion`'s own 150-200ms
ease-out scale (below), not a change to it.** Both linear gauges (the
detail card's own and each "Tous les cours" row's own compact bar) and the
ring all animate on mount: 700ms ease-out, longer than this document's own
150-200ms interaction-motion ceiling because this is a one-time entrance
read on a data-dense screen, not a response to a click — the same
reasoning that already sets the review card flip apart as its own
orchestrated moment. Switching pills (or a "Tous les cours" row)
key-remounts the detail card, replaying its own three animations each
time; the list rows themselves animate once, on the page's own first
load, and do not replay on a pill switch. `motion-reduce:transition-none`
on every animated element respects a reduced-motion preference by jumping
straight to the real value — this app's first use of Tailwind's
`motion-reduce` variant anywhere in the codebase, checked by grep, not
assumed from this document's own pre-existing (and unverified by this
pass) claim that `prefers-reduced-motion` already disables the review card
flip and mascot motion elsewhere.

- **Coverage** — real percentage always shown, answering "how much of this
  course have I opened at all": the share of notions with at least one
  review done, regardless of how well it went.
- **Readiness** — a second gauge, answering a different question: "if I do
  nothing else between now and the exam, how will this hold up that day."
  It is a projection forward to the deadline, not a reading of today.

**Both gauges, and the ring, are filled with the selected course's own
colour, not `--primary` — a deliberate reversal of `Subject colours`' own
"never indicate progress or state" rule, scoped to this screen alone, per
the user's explicit instruction.** The "Tous les cours" list (below) does
the same, each row in its own course's colour. Previously this screen used
the app's one neutral progress device (`--primary` over `--border`,
`Colour`'s own token-table row for `--primary` already lists "progress" as
one of its roles) — the same device Révision and every other gauge in
this app still uses; this screen is now the one named exception, not a
change to that device itself.

**The old "one sentence per course" status line is gone, split across the
card instead**: the deadline countdown ("Contrôle dans N jours"), the
behind-notion clause appended to it inline (only when relevant, below),
and the recently-added-notions sentence each get their own line near the
top of the card rather than being concatenated into one long sentence — a
consequence of the card now showing one course at a time instead of a
dense grid where compactness mattered more.

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

A course behind its target is stated as a fact, never scolded: the notion
count (never a percentage-point deficit, never a time estimate) appended
inline to the deadline countdown, in the card's own default `--text`
colour — not `--warning`, despite an earlier version of this note once
saying otherwise. That was never actually shipped: `--warning` text at
this body size measures roughly 1.8:1 against the card's white
background, under the 3:1 floor `Accessibility floor` (below) demands for
UI-sized text, and the code has carried a comment saying so since before
this pass — this correction brings the doc in line with what was already
there, not a new decision. Weight and position (leading, right after the
day count) carry what emphasis this fact gets; colour carries none. No
streak, no "tu n'as pas ouvert ce cours depuis 5 jours", no red — the
streak (global now, `Screen notes`' own Aujourd'hui note, below) and
Aujourd'hui's own countdown badge (scoped to its own course cards) are
both exceptions elsewhere, not here.

**A course whose deadline has already passed keeps showing coverage and
readiness like every other card — the lapsed date is one more fact about
the course, never a takeover of the whole card.** Both gauges (and the
ring) render exactly as they do on any other card (`target` and
`status`-derived facts stop applying past the deadline — see
`docs/modules/progress.md` — but `coverage` and `readiness` never depended
on the deadline at all, so neither is affected).

The message reads **"Cette échéance est passée."** (no second sentence)
and sits directly under the course title, above the ring/gauges — the
first thing read about this course after its name, the same way a due
count already leads Aujourd'hui's own card. It carries no
colour: `font-semibold`, full-strength `--text` (not `--text-muted`), same
`text-sm` as everything else on the card — weight and position carry the
emphasis a colour used to, the same lever `strong` already uses in
rendered markdown elsewhere in this app. This also retires the boxed
`border-warning`/`bg-warning/10` treatment the message used to carry,
which measured roughly 1.8:1 against the card's white background — well
under the 3:1 floor for a UI-component border, and never actually checked
until this pass. Not patched: removed, since a coloured box was never
right here to begin with — `Calendrier`'s own rule already states a past
date "renders exactly like one still to come — no `--warning`, no colour
of any kind marking it overdue" (below), and this state was the one place
on the app that still contradicted it.

**Two actions, not one: "Modifier l'échéance" and "Supprimer
l'échéance."** Previously only the first existed, so a stale deadline
could be edited but never removed. Both are the exact idiom every other
destructive/secondary action in this app already uses — `Modifier
l'échéance` stays the card's own `--secondary` `Button`, the same label
and action an upcoming deadline already uses (no separate "Mettre à jour"
wording for a lapsed one: the message above it already says the deadline
is stale, so the button doesn't need to repeat that, and a first attempt
at a distinct label — "Mettre à jour l'échéance" — measured against this
card's own real width (originally the 3-column grid's own column, now the
single detail card's own width, no narrower) and, paired with "Supprimer
l'échéance" on the same row, wrapped to two lines; "Modifier l'échéance"
fits on one, checked the same way). `Supprimer l'échéance`
is the same plain `--text-muted` underlined link `Supprimer` uses
everywhere else in this document, reused as-is rather than invented
fresh. No confirmation modal, per `Forbidden`'s and this document's own
destructive-actions rule (above): low visual weight already tells the
story.

**"Tous les cours"**: a `TrendingUp`-labelled section beneath the detail
card, one compact row per course — a colour-tinted icon circle, the title,
a short deadline sentence ("Contrôle dans N jours" / "C'est aujourd'hui" /
"Échéance passée" / "Aucune échéance"), and the same two gauges as the
detail card's own, at a smaller scale (label and percentage share one
line, a 1.5px fill beneath, rather than the detail card's own dominant
`--text-display` number) — a full duplicate `--text-display` reading per
row would compete with the one course actually being read in detail
above it. Every row is clickable, selecting that course the same way its
pill does; the currently-selected row alone carries a left border in its
own colour, `Subject colours`' own note above naming this the one
exception to "no left border any more" — a selection cue, not a permanent
identity marker repeated down every row the way this screen's own left
border used to be before this pass.

Four states, same as before this pass: **loading** is a skeleton, no
mascot; **error** is `confused` and a retry; **empty** (no course at all)
is `idle`, inviting a first photo; **ready** is the pill row, detail card
and course list described above, no mascot on the ready state itself
(data-dense).

**Calendrier** (`workspace` module — see `docs/modules/workspace.md`'s
Calendar section) — A month grid: seven weekday columns, a row per week,
"‹ Mois précédent" / "Mois suivant ›" navigation either side of the current
month's name ("Mars 2026"), both real `--secondary` buttons with their own
accessible label, never a bare arrow glyph. Every day is clickable,
including an empty one; selecting a day highlights its cell (`--primary-soft`,
the same selected-state token used elsewhere) and reveals its contents in a
panel below the grid, never a modal — a day can hold several entries, and
the Forbidden list below reserves modals for something shorter than that.

Not extended to a left border here: this screen's unit is a day cell, not a
course card, and it already carries subject colour fully through its own
dots (below) and the day panel's own entries — a border has nothing to
attach to on a cell that can hold several different courses' colours at
once. `Notions du cours` (`NotionsScreen`) is skipped for a different
reason: every row on that screen already belongs to the one course its
header names, so a border repeated identically down every row would encode
nothing a card grid's border does — no course-to-course distinction to make
on a single-course screen.

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

**Lecteur** (M7 addition — see `docs/MILESTONES.md`) — Redesigned from a
user-supplied mockup in a later M9 pass, ignoring this file's own former
picker-plus-course-view description below in full, the same unification
Notions went through first (`Screen notes`' own Notions note, above).
`Navigation`'s own note (above) already describes what changed at the
nav-entry level; this note describes the page itself.

**One page: a pill row of every course, then that course's own reading
surface and "Étudier ce cours" panel — no separate picker to leave.**
Reached the same three ways as before this pass — a course's card on Mes
cours ("Lire le cours"), Notions du cours' own toolbar, and directly from
the nav — but all three now land on this one page rather than two of them
skipping a separate picker page. Each pill reuses `NotionsScreen`'s own
`CoursePill` component unmodified (`BookOpen` plus the course's own title,
filled `--primary`/white when active). Switching pills is a local
selection, not a navigation: the selected course's own content
(`ReaderCourseContent`) resets on switch via a `key`-based remount, the
same idiom `NotionsScreen`'s own course body already uses, so a stale poll
from the previously-selected course never leaks into the new one.

**"Retour" sits on its own line beneath the pill row, a plain underlined
link — shown only when a `documentId` arrived from an existing deep link**
(a course's card on Mes cours, Notions du cours' own toolbar); absent
entirely on the nav's own direct entry, which shows the first course with
nothing to go back to, the same as Notions/Aujourd'hui/Mes cours' own
top-level pages. There is no `fromPicker` case any more (the picker it once
distinguished from doesn't exist): `fromNotions` true returns to that
course's Notions du cours; unset (opened from a course's own card on Mes
cours, unchanged since M7) returns to Mes cours. The label stays plain
"Retour", not "Retour à mes cours": a label naming one specific destination
would lie on the other path. The page's own `<h1>` stays "Lecteur" in every
state, never "Lecture" — one constant page name, the course's own title
rendered separately as an `<h2>` inside the reading card below, the same
"page name never duplicates the thing inside it" rule Notions' own summary
card already follows.

**The course content's own heading scale is a rule, not a calibration
value: content can never render at the same size as the chrome that
contains it.** This screen's own DOM already nests the document's
headings two levels below the reading card's own `<h2>` (`h1` from the
markdown becomes a DOM `h3`, and so on — see the code comment on
`READER_COMPONENTS`), but nesting the DOM alone doesn't nest the *look*.
Content's own scale is `text-lg`/`text-base`/`text-sm` (18/16/14px) for
`h1`/`h2`/`h3` — every level strictly under `--text-title` (20px), the
smallest heading the chrome itself ever shows, so no content heading can
ever equal or outrank it, whatever the source document's own structure
looks like. `h3` lands at the same 14px as ordinary body text; weight
(extrabold) and typeface (`--font-display` vs. `--font-body`) still carry
the "this is a heading" signal on their own, the same two channels every
heading in this app already relies on. The `mt-8`/`mt-6`/`mt-4` rhythm
between levels is unchanged from the original calibration, checked on a
static mockup at the time.

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
already does by hand on every other screen. The reading card caps at
`max-w-2xl`, narrower than the rest of the app's 1152px content width — a
deliberately shorter line length for continuous prose, the same "cap it
instead of stretching it" principle as Shape and depth's form-width rule.

**The reading card and the "Étudier ce cours" panel sit side by side on
`--canvas`, each its own `Card` (`--surface`, bordered) — the mockup's own
layout, superseding this file's former one deliberate `--canvas`
deviation** (a full-page `--surface` reading surface). That exception is
gone: Lecteur now follows the same "content area on `--canvas`, cards on
`--surface`" default every other M9 screen already uses, not a special
case of its own. On narrow viewports the panel stacks beneath the reading
card (`flex-col` below `lg`), never beside it — there is no room for two
280px-plus columns under the mobile/tablet breakpoints `Layout and
responsiveness` already defines.

**"Étudier ce cours"**: a title, one short sentence ("Exercice de
mémorisation."), and two rounded-2xl buttons — "Réviser les notions"
(`Layers`, `accent`, primary) and "Discuter avec le tuteur"
(`MessageCircle`, `secondary`) — this page's own answer to "un renvoi vers
les notions ou le tuteur" from the mockup. Both icons are reused from the
nav's own assignment for the same destination (`Icons`' own note, above),
not invented. The panel's own title is deliberately lighter than a real
heading — the body font at `font-semibold`, not `--font-display`'s
extrabold every other card title in this app uses — since it names a
secondary aside beside the reading card, not a competing section of its
own; a second mockup pass shortened the original copy ("Étudier cette
page" / "Transforme ce que tu viens de lire en exercice de mémorisation.")
to this tighter pair. "Discuter avec le tuteur" carries a light green wash
(`bg-primary-soft`/`text-primary`, borderless) rather than the plain
bordered `secondary` every other non-accent button in this app uses — the
same tint idiom Mes cours' own "Lire le cours" button
(`DocumentsScreen.tsx`) already established, reused here rather than
invented. Shown only in the ready state: there is
nothing to study yet while a course is still extracting, failed, or empty,
so the panel is absent in every other state rather than shown disabled.

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

Four states, all beneath the page's own constant "Lecteur" header and pill
row: **loading** is a skeleton (short animated bars, no mascot — no screen
in this app puts a mascot on a plain network fetch), shown first for the
course list itself and then, once a course is selected, for that course's
own content; **error** is `confused` and a retry, same wording pattern as
every other screen, at either level (the course list, or one course's own
content); **empty** (no course at all) is `idle`, "Ajoute un cours dans Mes
cours pour le lire."; **ready** is the reading card plus the study panel,
no mascot on the reading card itself (data-dense, docs/UI.md's one-mascot
rule already excludes it). Within a selected course, the extraction status
branches further, since this screen is reachable by more than its one
gated button — a stale button render, a future entry point, anything that
skips the check must still land somewhere defined:
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
- `done` with real content: the reading card (course title and subject
  colour dot, then the rendered markdown) plus the study panel beside it

**Tuteur** — Chat scoped to one course. `MessageCircle` in the nav (`Icons`'
own note above). Reachable two ways, the same two-source shape Progression
also has (`Navigation`'s own note above; each source distinguished by
whether a `documentId` arrived, not two different pages): directly from the
nav, with no course chosen yet, and from within a course, via a toolbar
entry on `NotionsScreen` ("Discuter du cours", next to "Lire le
cours"/"Voir la progression"/"Réviser") that arrives with a course already
set.

**Entered without a course**: a picker reusing `Mes cours`' own list and its
own four states, unmodified, each row now routing into Tuteur instead of
Notions — the one screen left that still lands on a separate picker page
rather than a pill selector plus content shown directly (`Screen notes`'
own Lecteur note, above, is the most recent of the others to drop it).
Unlike Progression, entered the same way, a conversation is scoped to
exactly one document (`docs/modules/tutor.md`), so picking one first is
unavoidable here, not merely a default the way Progression's own first-pill
selection is.

**No conversation-list route exists** — `docs/modules/tutor.md`'s API has
Start, History, Ask and Delete, never "list this document's conversations" —
so the screen does not offer a history of past conversations to resume, and
does not need to: the client keeps at most one active conversation id per
document, in `localStorage`, written once `POST .../conversations` succeeds
and read back on the next visit to the same course. A per-viewer
convenience, not the record of truth — losing it (a private window, cleared
site data, a different device) starts a new conversation, not a lost one:
the old row still exists server-side, just unreachable from this screen
without a route this milestone has no acceptance criterion asking for.

**Document readiness gates the composer, not a failed request.** Before
showing it, the screen reads the same document detail
(`GET /api/documents/:id`, already used by `Lecteur` and `NotionsScreen` —
no new route) and, for anything short of `done` with real markdown, renders
exactly `Lecteur`'s own three non-ready states in the composer's place
(`Lecteur`'s own note above), word for word: still extracting is `reading`
with the same wait message and the same 30-second poll, `failed` is
`confused` with the same "mets-à-jour depuis Mes cours" and no duplicate
retry button, done-but-blank is `idle` with the same "ne contient pas
encore de texte lisible." One fact drives both this screen's gate and
Lecteur's own states, worded identically on purpose, rather than asking the
student to send a question just to learn the course was never readable.

**Four states once the document is ready:**
- No cached conversation id for this document: nothing to fetch, so no
  loading state — the screen opens straight on **empty**, below.
- A cached id exists: **loading** while `GET /api/conversations/:id`
  resolves — skeleton message bubbles (`Required states`'s own shape rule),
  no mascot (a plain data fetch, the same call `Lecteur`'s own loading state
  already makes).
- **Empty** — no messages yet, whether freshly started or an existing empty
  conversation: `idle`, "Pose ta première question sur ce cours." The
  action is the composer itself, already on screen, satisfying `Required
  states`'s "the action right there" without a separate button.
- **Error** — fetching the conversation failed: `confused`, retry, the same
  wording register as everywhere else. Distinct from document readiness
  above, which is not an error and never renders `confused` for a course
  that is simply still being read.
- **Ready** — the conversation, oldest message first, composer pinned at
  the foot of the screen.

**Streaming.** Sending a question appends it to the list immediately (not
the optimistic UI `Asynchronous work` forbids for generated content — the
student's own words are not generated) and opens the assistant's reply as a
streaming bubble: Fiche in `thinking` while chunks arrive, gone the moment
the first chunk renders (kept from this note's earlier, shorter version).
Chunks append to that one bubble as each `event: chunk` arrives; the bubble
is finalised by whichever terminal event closes it.

**`event: done` — a complete answer.** Citations render as a short list
beneath the bubble, collapsed by default: a single trigger, "Voir les
sources (N)" / "Masquer les sources", the same mechanism `NotionsScreen`'s
own "Voir le contenu" already uses — the trigger becomes the close action,
`aria-expanded` carries the state, per message, never persisted (a `Set` of
expanded message ids in component state, not `localStorage`: a reload
always shows every citation list collapsed again, same as a reload already
shows every notion's own content collapsed). Styled `--text-muted`, not
`NotionsScreen`'s own `--primary`: a citation is not content worth inviting
someone to explore, it is a justification consulted on demand, closer to
"Retour"/"Lire le cours"'s own chrome register than to a genuine content
reveal. Nothing actionable hides behind it — the list is plain text, never
a control. Each citation is the actual cited text (`citation.text`, sliced
server-side from a real section — `docs/modules/tutor.md`'s Ports section),
never a model-generated summary of what it cited — rendered through
markdown (below) for readability, but the underlying string is untouched by
that: `citation.text`, both stored and returned by the API, stays an exact
substring of the course's own source markdown, character for character.
Rendering is a presentation-layer concern only; it never touches the string
the whole anchoring mechanism actually depends on.

A `grounded: false` complete answer — a refusal — gets no distinct
treatment at all: same bubble, same colour, no mascot, no border. The only
difference from a grounded answer is that the citation list beneath it is
simply absent, because there is nothing honest to put there; the model's
own prose already states plainly that the course does not cover the
question, in the same French, tutoiement, sentence-case register as
everything else (`Copy`, below). A distinct visual treatment on top would
make a legitimate answer read as a degraded one — exactly what
`docs/modules/tutor.md`'s design set out to avoid by dropping a retrieval
threshold in the first place.

**Both the answer and its citations render through markdown, not plain
text** — `react-markdown`, the same dependency `Lecteur` and
`NotionsScreen` already use, through a components table of its own
(`TUTOR_MARKDOWN_COMPONENTS`), not either of theirs: headings and
paragraphs render but are held to the size of the surrounding bubble, never
a `Lecteur`-sized heading inside a small citation. This was previously
plain text (`whitespace-pre-wrap`) — an oversight found late, not a
decision: literal `#` and `**` were visible on screen.

**Links and images are neutralised in this one table, deliberately, and
only here.** `Lecteur`'s and `NotionsScreen`'s own components tables render
a real, clickable `<a href>` and a real `<img>` by `react-markdown`'s own
default, because their source is always the student's own uploaded
document. Tuteur is the first place in this app that renders markdown a
*model* produced, not markdown ingestion extracted from that document — and
the course content feeding that model is not the model's own trusted words
either, it is text a student uploaded, which the model reads as part of
every prompt. Nothing stops that text from trying to steer the model into
echoing back a markdown link or image pointing at an arbitrary URL, an
indirect prompt injection the ingestion pipeline was never exposed to,
because it never asks a model to produce prose that this app then renders
as a clickable surface. `TUTOR_MARKDOWN_COMPONENTS` renders a link's own
text and an image's own alt text as plain text, never a real `<a>` or
`<img>`: nothing in a tutor answer or a citation can become a clickable
link or an externally-loaded image, regardless of what the course content
or the model produced. Applied uniformly to citations too, even though
their source is the same trusted extracted markdown `Lecteur` already
renders unrestricted — one table is simpler to reason about than two that
differ only for a case that has not actually happened yet.

**`event: partial` — a stream cut short.** The text that already arrived
stays exactly where it rendered, never discarded, never retried
automatically. Directly beneath that bubble, one `--text-muted` line, no
icon, no mascot, no colour: "La réponse s'est arrêtée avant la fin." — text
alone, the same register `Required states`'s own Error row already uses
(what happened, no apology, no raw code), not the two-coexisting-states
icon device `Colour`'s own ReviewScreen note reserves for peers competing
inside one list, which a single message's own completeness marker is not.
The composer pre-fills with the question that was just asked, so resending
it is one tap, not a retype — a genuine one-tap "regenerate" would mean
deciding whether it replaces the partial message or appends a new pair, a
real design question this milestone does not need to answer, so it stays
unbuilt rather than guessed at. Rendered by a component whose `partial` prop
is required, not optional, with no branch shared between the two outcomes:
there is no code path that renders a message bubble without having decided
which of the two it is, the same discriminated-union shape `Answer` already
has server-side (`docs/modules/tutor.md`).

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
- Never comment on pace or effort, and never imply lateness: no "tu es en
  retard", no "plus que 2 jours" as a pressuring frame. State facts:
  "Contrôle le 12 juin", "14 fiches à revoir", and "Examen dans 9 jours"
  and a streak length (M9, `Screen notes` below — the streak now lives in
  the persistent nav sidebar, visible from any screen, not Aujourd'hui
  only) —
  a day count and a fact about past activity, stated once, not turned into
  a pace judgement the way "tu es en retard" or "3 jours d'affilée !" (an
  exclamation performing enthusiasm about the count itself) would be. The
  line is register, not subject: `docs/UI.md`'s M9 note under `Who this is
  for` (above) is what actually decides which day counts are in bounds.

**No badges, no points, anywhere.** Progression's own progress is the real
count of notions mastered, never gamified — that number is true, and it is
what the exam measures. Aujourd'hui's own streak (M9, `Screen notes` below)
is the one narrow exception to "no streaks", not a reopening of this line:
a single, uneditable, ungoaled count derived from real review activity,
never a badge, a level, or a point total layered on top of it.

---

## Accessibility floor

Checked in the Playwright suite:

- Visible keyboard focus everywhere. Never `outline: none` without a replacement.
- Contrast AA on all text. `--warning` is never a text colour on white at
  body size (it fails 3:1, let alone 4.5:1). `--primary` passes 4.5:1 as
  running text too (`#0F7B5F`, 5.23:1, `Colour` above) but its accent role is
  still not used that way, on purpose: that role's one job is marking the
  primary action, and letting it also colour arbitrary text — an error
  message, say — would blur that single meaning even where the numbers
  technically allow it.
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
- More than one accent-styled element inside the same card, or on a
  single-purpose screen that is not a grid of cards (`Colour`'s own note
  above on why a card grid reads differently)
- Icon-only buttons without an accessible label
- Infinite scroll
- Any colour outside the token set
- A status word or colour that implies a person is late or behind, outside
  of a plain stated fact (`Who this is for`'s own note above draws the
  line: a day count stated once, as a fact, is not this; a red "en retard"
  or a ticking clock is) — narrowed by M9 from a blanket ban on any
  countdown or streak, which the streak (global, in the nav sidebar) and
  Aujourd'hui's own countdown badge (scoped to its course cards) are now a
  deliberate exception to (`Screen notes`, below); Progression and
  Révision keep the original, stricter reading

---

## For agents

- shadcn/ui is the component base. Restyle through tokens; never fork a component
  to change a colour.
- New shared components go in `apps/web/src/components/ui/`, mascot poses in
  `apps/web/src/components/mascot/`. Announce either in your message: shared
  components are where parallel agents collide.
- If a screen needs a pattern not described here, stop and ask. Do not invent an
  interaction model and leave the human to find it in review.
- **A Tailwind arbitrary value referencing a token (`text-[var(--...)]`,
  `font-[var(--...)]`, and any other prefix covering more than one CSS
  property) needs an explicit type hint** — `text-[length:var(--text-title)]`,
  `font-[family-name:var(--font-display)]` — never the bare form. Without
  one, Tailwind guesses the intended property from the value's own syntax,
  and a `var(...)` reference gives it nothing to guess from: `text-` and
  `font-` both guessed wrong for every token in this file (`Type`'s own
  note, above) and it went undetected through an entire pass because
  every test checked for the class-name string, never what it compiled
  to. `gap-`, margin/padding, and `rounded-` need no hint — they map to
  exactly one CSS property each, nothing to disambiguate. When adding a
  new arbitrary-value class for a token, check what it actually compiles
  to (`apps/web/src/styles/tailwind-type-hints.unit.test.ts` does this
  against the real Tailwind compiler, not a guess) before trusting the
  class name alone.
