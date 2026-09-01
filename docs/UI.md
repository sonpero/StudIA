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
| `--accent` | `#0F7B5F` | The single primary call to action. Nothing else. |
| `--success` | `#12B556` | Completed, mastered |
| `--warning` | `#F5B940` | Due soon, needs attention |

**`--accent` belongs to the app, never to a course — non-negotiable.** It is
a fixed colour, the same on every screen and every card, chosen once here;
nothing about a specific course, its subject colour, or its state ever
changes it. The moment an accent button started borrowing a course's own
colour, that colour would stop meaning "this is Maths" and start meaning
"this one needs attention" — exactly the confusion `Subject colours`' own
second rule (below) exists to prevent. Kept as its own token, distinct from
`--primary` (`#2563EB`, active nav) even though an earlier version of this
pass considered collapsing them into one shared value — deliberately not
done: the two answer different questions (which nav item is active, versus
which button on this card is the one to press), and coupling them would
mean a future change to one always dragging the other along for no reason
tied to either question.

**A deep green, not the indigo that first replaced red.** `#F04438`, this
token's original value, was tried and rejected in an earlier version of
this same pass: white text on it measured 3.76:1, under the 4.5:1 floor
`Accessibility floor` (below) demands, a real pre-existing failure this
pass's own contrast check caught. Darkening it to `#D92D20` (same hue,
4.83:1) fixed the contrast but not a second, worse problem, found by
looking at the screen with real course cards rather than trusting the
numbers alone: `#D92D20` sat 3.9° from the subject palette's own red
(`#F87171`) — a course's own identity colour and the app's one call-to-
action, indistinguishable on Mathématiques' own card. Reusing `--primary`'s
indigo was tried next and did clear that collision (22.8° from the
palette's own closest hue), but was set aside for a different reason: it
is Tailwind's own default blue, instantly recognisable as such, and wearing
a framework's stock colour as the app's own signature reads as an
un-designed, generated interface. `#0F7B5F`, a deep green, is what this
pass settled on instead — chosen for what it says, not just what it avoids:
green already means "forward, on track" everywhere outside this app, which
is exactly what pressing "Réviser" is, where blue said nothing in
particular. Measured, not assumed: white text on `#0F7B5F` is 5.23:1,
clearing 4.5:1 with room to spare, no lightness adjustment needed.

**Every semantic colour token's hue family is excluded from every other,
enforced, not just written down.** First written as an accent-vs-subject-
palette rule alone; widened once `--accent`'s own move to green surfaced a
collision this narrower rule couldn't see: `--success` (`#12B5A5`, hue
174°) sat 9.7° from the new `--accent` (`#0F7B5F`, hue 164°) — the same
family of problem, between two *semantic* tokens this time, not a
semantic token and a subject colour. The real invariant was never "the
accent avoids the subject palette", it is "no two colours this app hands
out a fixed meaning to — `--primary`, `--accent`, `--success`,
`--warning`, and every subject-palette hue — read as the same colour."
`15°` remains the floor (unchanged from the narrower version of this
rule): nothing new has been measured to move it, and the values below sit
either comfortably clear of it or were moved specifically to clear it.
`apps/web/src/styles/tokens.colour-collision.unit.test.ts` (renamed from
`tokens.accent-collision.unit.test.ts`, no longer accent-specific) now
checks every pair drawn from that full set, not just accent-vs-palette.

Two collisions this widening found, both fixed by moving the *subject*
colour, never a semantic token — the same policy the accent/turquoise fix
above already established, extended rather than reconsidered:
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

**`--success` moves, it is not retired, even though `--accent` now also
means "forward, on track".** Considered and rejected: the two tokens still
answer different questions on the one screen where they appear
together — `ReviewScreen.tsx`'s graded MCQ view sets `ring-success` on
whichever option was factually correct and, when the student picked a
*different* option, `ring-accent` on that wrong pick, both visible at
once, on two different options in the same list. Collapsing them into one
green would leave nothing distinguishing "this was the right answer" from
"this is merely what you clicked" at the exact moment a wrong answer most
needs to read as wrong — the opposite of decorative, load-bearing for the
one thing this app is for. Moved to `#12B556` (hue 145°, clear of the
whole `--accent`/turquoise cluster entirely rather than squeezed beside
it — 19.4° from `--accent`, comfortably past the floor).

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
(below) has always banned a second `--accent` element competing for
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
and Notions du cours' per-notion card's own "Réviser cette notion" (`Icons`'
own note) are both accent, one per card, for the same reason in both places.

**Notions du cours' own *toolbar* "Réviser" is accent too, and this does
not put two accents in one card.** An earlier version of this pass kept it
`--secondary`, reasoning it was "a peer among several toolbar actions
outside any card" — true as far as it went, but it missed that the same
word names the same gesture twice on one screen: the toolbar's "Réviser"
and every notion card's own "Réviser cette notion" are the identical
action (review, whole-document or scoped to one notion), so leaving one of
the two looking like a plain secondary button while the other reads as the
screen's one call to action was inconsistent, not neutral. The invariant
that actually matters is still exactly what it always was — **never more
than one accent element inside a single card** — and it still holds:
the toolbar's "Réviser" sits outside every card, so it never shares a
card boundary with any notion's own "Réviser cette notion" to double up
against. It coexists with the grid of per-notion accents the same way
those already coexist with each other — each represents its own
self-contained decision (this whole document, versus this one notion),
not two elements competing for the same choice.

### Subject colours

Each course gets a colour, assigned automatically at creation from this rotating
palette, and editable by the user. The colour identifies the course everywhere:
calendar chips, card left borders, task dots, plan entries.

`#F75757` `#F36016` `#109DA0` `#0897D6` `#8B5CF6` `#EC4899`

Neither `--accent` nor `--primary` appears in this palette, deliberately: a
course must never look like the primary call to action or like the active nav
state — and neither does any hue close enough to `--accent`'s own to read as
the same colour, `Colour`'s own note above (SVT's own default, tested and
enforced there, is what changed to hold this).

Two rules:
- A subject colour is always paired with the course name or an icon. Colour alone
  never carries meaning.
- Subject colours are for identity only. They never indicate progress or state.

**Card left border, not a tinted background.** Where a course gets its own
card — Aujourd'hui's course cards and Progression's — the colour runs as a
4px solid border down the card's left edge, `aria-hidden` like the dot it
replaces, paired with the course title the same rule above already requires.
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
  action.** Found on Notions du cours' own toolbar: "Lire le cours" /
  "Voir la progression" / "Réviser" sat as three `Button`s of identical
  weight, and at 375px the row didn't fit — three bordered buttons plus a
  count, unwrapped. Stacking the buttons or shortening their labels were
  both rejected: the actual defect is that nothing on screen said which of
  the three mattered most, the same "identical weight, one is supposed to
  dominate" mistake `Aujourd'hui`'s own course-card buttons already had
  and were fixed for. "Lire le cours" and "Voir la progression" leave this
  screen for another one — reading the course, checking its progress —
  while "Réviser" is this screen's own action, and now shares its accent
  colour with the identical gesture on every notion card below it
  (`Colour`'s own note above). The two navigation actions demote to a
  plain underlined link, the same idiom `Forbidden` already uses for
  every other secondary or destructive action in this document ("Retour à
  mes cours," "Supprimer") — narrower than a bordered `Button` by
  construction, which is what actually closes the 375px gap, not a media
  query reshuffling the same three buttons. The only toolbar in the app
  shaped like this today; written as a general rule for the next one, not
  because there are two yet.

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
Aujourd'hui, `BookOpen` for Mes cours, `TrendingUp` for Progression,
`Calendar` for Calendrier — Tuteur gets its own once it has a screen), and
on each card's own primary, forward-moving actions — the ones docs/UI.md
already calls "a path to action" on Aujourd'hui's own course card:
`BookOpen` for "Voir le cours"/"Voir les notions" (both land on the same
course-detail screen), `BookOpenText` for "Lire le cours" (a distinct
destination, the continuous-reading Lecteur), `Repeat` for "Réviser"/
"Réviser cette notion", `CalendarClock` for setting or updating a deadline,
`RotateCw` for a single failed document's own "Réessayer", `Upload` for
UploadCard's "Confirmer". Never on a card's dismissive or destructive
action — "Supprimer", "Supprimer l'échéance", "Annuler", "Régénérer les
fiches", "Voir le contenu"'s expand toggle: these are already visually
demoted (a plain underlined `<button>`, never the `Button` component) or
already named as destructive/secondary in this document or in code
comments, and adding an icon would raise their visual weight in exactly the
direction the demotion was deliberately fighting.

Not extended to `Calendrier` (a day cell, not a course card — the same
reasoning `Subject colours` already gives for why that screen's colour
treatment stops there too) or to `Lecteur`/`Révision` (a single "Retour", or
grading controls — neither is a course-card grid). `NotionsScreen`'s own
toolbar ("Lire le cours", "Voir la progression", "Réviser" above the notion
list) is plain page chrome, not inside a `Card`, so it is out of scope by
the same "actions of a card" rule that puts an icon on that screen's
per-notion `Card`'s own "Réviser cette notion" instead — **reconsidered,
not just carried over, once the toolbar's own "Réviser" became accent
(`Colour`'s own note above): the icon rule's boundary was always
structural (inside a `Card` or not), never about colour or weight, and
that boundary hasn't moved just because the button's colour did. "Lire le
cours" and "Voir la progression" are answered the same way `Forbidden`'s
neighbouring list already does for every other demoted plain link in this
document — a step down from the `Button` component entirely now (below),
and an icon would raise their weight back up in exactly the direction
that demotion exists to avoid.** `ProposalsScreen` (reviewing photo-derived
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

**"Se connecter" is `--accent`, and this is one of the few places in the
app where that is actually earned:** a single focused screen with exactly
one action, the same shape as ReviewScreen's session-end/post-grade
buttons and UploadCard's `Confirmer` — not one of several peer actions
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

**Aujourd'hui** — Large greeting title, then **one card per course** that has
something to say today, never split into separate lists by kind. A course
with nothing due, nothing below its exam target, and no deadline gets no card
here at all: this screen answers "what do I do now", not "what are all my
courses" — that catalogue is `Mes cours`. When every course is like that, or
there are no courses yet, the screen falls to its empty state below.

**One grid, not two.** Course cards and the todos card (below) are items in
the *same* grid — one column below the tablet breakpoint, two on desktop —
so their edges share the same gutters instead of the todos block landing in
its own, differently-sized column underneath. **Grid items stretch to the
row's own height** (`items-stretch`, the grid's own default — reversed
from an earlier version of this pass, which used `items-start` specifically
to stop a short card being stretched behind its buttons): every card in a
row now shares one height, and each card is its own flex column with its
action row pushed to the card's own bottom edge (`mt-auto` on that row,
below) — so a shorter card's content stays anchored at the top, the extra
height lands as breathing room *above* its buttons, and nothing ever floats
over a gap beneath them the way a stretched, non-flex card would. Course
cards fill the grid left to right, top to
bottom, **sorted by urgency, nearest deadline first**: `deadline?.daysAway
?? Infinity`, ascending — a course three days from its exam sorts ahead of
one three weeks out, and a course with no deadline at all (`daysAway`
missing, read as "never", not as "now") sorts after every course that has
one. Ties — same `daysAway`, or several courses with none at all — keep
whatever order `buildCourseCards` already produced for them:
`Array.prototype.sort`'s own guaranteed stability does that, not a second
explicit tie-break key. Display ordering only: `TodayView`'s three arrays
(dueCards/notionsBelowTarget/upcomingDeadlines) are untouched, and nothing
about which course actually has due cards or is below target changes, only
where its card lands in the grid. The todos card is simply the next item
after the last course card, wherever that now lands — not pinned to a
fixed side.

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

Each course card carries its subject colour as the left-border treatment
`Subject colours` describes, replacing the small dot this card used next to
its title before. A course reached only through `upcomingDeadlines` (no due
count, no below-target count — `workspace.md`) carries no colour at all, the
same as it carried no dot before: its card's border stays plain `--border`
on all four sides.

Every card is a path to action, not just a number, through two explicit
buttons — same idiom as the per-item actions on `Mes cours`' own course
page, never a click hidden on the title: "Voir le cours" always opens that
course's page, and, only when the due count is above zero, "Réviser" starts
a review session for that course directly. **Now with a real hierarchy
between them, not the identical weight both used to carry:** "Réviser",
when it is there, is the card's one `--accent` button — it is the action
that actually moves the student forward, spaced repetition's whole point,
so it is the one that looks like the obvious next click. "Voir le cours"
stays `--secondary` on every card, always, whether or not its sibling
"Réviser" is present that day — a stable rule (the same button always
looks the same way) beats a rule that would repaint "Voir le cours" as
accent on the days it happens to be the only button on the card. A card
with no due count shows only "Voir le cours", and shows it exactly as
secondary as it is everywhere else: absence of the accent action is not an
invitation to promote the remaining one. `Colour`'s own note above is what
allows several cards to each show their own accent "Réviser" on this one
screen at once — the invariant is one accent element per card, not one
per screen. This is the row of buttons `One grid, not two` (above) means by
"action row": `mt-auto` on it is what pushes it to the card's own bottom
edge once the grid's `items-stretch` has made the card taller than its own
content needs.

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
stakes and trivially re-added. The gap between one todo row and the next is
`--space-block` — `Shape and depth`'s own table already names this exact
relationship ("rows in a list"), and the list had been using the tighter
`--space-related` instead, the same gap as a checkbox and its own label
*inside* one row: two different relationships reading as one distance is
what made the list look like a single undifferentiated block rather than
a set of rows, exactly the "nothing groups visually" defect this pass was
asked to close.

**The checklist is a bounded, scrollable panel** (`Shape and depth`'s own
general rule, above), capped at roughly five rows before it scrolls
internally — `13rem`, tuned against the real rendered row height rather
than a round Tailwind step: `max-h-60` (15rem) was tried first and, checked
live, landed exactly on a row boundary, six full rows and no visible cut
at all, silently failing condition (2) of the general rule above. Everything
else in the card — the "Todos" label, both collapsed triggers, either
opened form — stays outside the scrollable region and always visible; only
the `<ul>` itself scrolls.

**A todo's due date, when it has one, is shown on its row** — discreet,
right-aligned, before the delete action. No date set means nothing shown
there: never a dash, never "sans date". The same rule as everywhere else
in this document applies to how it reads: a plain dated fact, never a
countdown, and a date already past renders exactly like one still to
come — no `--warning`, no colour of any kind marking it overdue.

**The add form and the photo picker are both collapsed by default**,
behind their own discreet `--secondary` action ("Ajouter un todo" /
"Ajouter depuis une photo"), the same width as each other
(`Shape and depth`'s own general rule, above) — a permanently open input
for either was, by itself, wider and taller than the list it sat below.
The photo trigger's label was shortened from "Ajouter des todos depuis une
photo de l'agenda" during this pass: "des todos" is redundant with the
card it already sits in, "de l'agenda" survives once the form opens
(`PhotoUploadInput`'s own field label, "Photo de l'agenda", unchanged),
and the shorter form keeps the same verb as its sibling trigger — a
deliberate choice over a still more literal cut, since the two triggers
reading as a matched pair is worth more here than either one being
maximally short on its own.

Opening the add form puts focus on the label field, and opening the photo
picker puts focus on its file input, the same convention for the same
reason on both — it is also what lets Escape reach either one at all: the
trigger button that opened it is gone the instant it does, so without this
the browser would fall focus back to the page body, outside the revealed
area entirely, and a keydown there would never bubble through it. Both the
add form and
the photo picker can be closed without submitting, by Escape or by their
own visible **"Fermer"** button (`Shape and depth`'s own general rule,
above) — a defect this pass found and fixed, not a pre-existing choice:
the add form's Escape handler existed with no visible equivalent beside
it, and the photo picker had no closing mechanism at all. Closing the add
form never discards what was already typed — reopening shows the same
draft, not a blank form — except when there was nothing to lose, in which
case closing is simply closing; closing the photo picker is disabled while
a photo is already uploading, the same guard `UploadCard`'s own "Annuler"
already applies to its own confirm step. A successful submission collapses
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

**Notions du cours (`NotionsScreen`)'s own header: the title stands alone,
top left; "Retour à mes cours" sits under the toolbar, right-aligned with
it, not beside the title.** Previously placed directly in front of the
title, reading as though the two were paired — a navigation back to the
parent list is not the same kind of thing as a screen's own name, and
sitting next to it suggested otherwise. It stays a plain underlined link,
never a `Button` — the same treatment "Lire le cours" and "Voir la
progression" now share (`Shape and depth`'s own toolbar-hierarchy note,
above), though for a different reason: those two are demoted because
they leave the screen for somewhere else, this one because it is the one
navigation action that was never a peer of the toolbar's own actions to
begin with. "Réviser" is the only one of the four still a `Button`, and
the only one in accent. Tab order follows the layout: the toolbar's own
actions (the two links, then "Réviser"), then "Retour à mes cours" last —
the natural consequence of where it sits, not a separate decision.

**Notions du cours (`NotionsScreen`) — why a notion isn't mastered yet, not
just its two raw numbers.** Each notion's own card already shows
`masteredCards / totalCards fiches maîtrisées`; on its own that number tells
a student nothing about what to actually do next, and `isMastered`
(`docs/modules/review.md`) is two independent conditions — `stability >= 21
days` and `reps >= 3` — so "you need more reviews" and "this just needs time
to settle" are two different facts, not one. Shown whenever
`masteredCards < totalCards` **and** `totalCards > 0` — deliberately not
`masteredCards > 0` as well: `0 / 3` is the single most common case this
exists for, the one where the question "why" is loudest, and an earlier
draft of this condition excluded it by mistake.

One sentence, reps first:
- `cardsWithEnoughReps < totalCards` → *"Il te manque encore des révisions
  sur cette notion."* — immediately actionable, so it wins even when some
  cards are also short on stability.
- otherwise, `cardsWithEnoughStability < totalCards` → *"Tu l'as révisée
  assez souvent, il faut maintenant l'espacer dans le temps."* — states the
  actual mechanism (stability only grows through reviews already spaced
  further apart) rather than reading as an invitation to do nothing, which
  an earlier draft of this sentence ("laisse-lui un peu de temps") did.

Both raw counts (`review.NotionProgress`'s `cardsWithEnoughReps` and
`cardsWithEnoughStability`, `docs/modules/review.md`) are shown together
regardless of which one picked the sentence above, in `--text-label`, one
size down from the sentence's own `text-sm` — smaller, never larger, per
`Colour`'s own rule that this kind of state is a fact, not an alert: no
`--warning`, no colour of any kind, a notion short of mastery is not a
failure. Never `stability`'s own numeric value (an FSRS internal, not
something a student needs to read as a number) — only whether it crossed
the same day threshold already named in the sentence, expressed as a count
of fiches over that threshold, the same idiom `masteredCards`/`totalCards`
already uses.

**"fiche(s)" and its verb agree with the denominator, not the numerator.**
`X/Y fiches ont …` reads as "X out of Y fiches", so it's `Y` — the
population the fraction is drawn from — that the noun and verb answer to,
not `X`. An earlier version agreed with `X` instead, so `0/3 fiche a fait`
and `1/3 fiche a fait` both read as correct-looking singular when the
notion actually has three fiches; every one of these lines is wrong except
when `X` happens to be 1. Plural exactly when `totalCards > 1`, singular
only when it is exactly 1 (`0/1 fiche a …`, the one case where singular is
genuinely correct) — one rule, no separate case for `X = 0` or `X = 1`.

**Upload** — Camera first on mobile, file picker first on desktop. Multi-page
capture is one document: several photos of the same lesson produce one course.
Thumbnails, reorderable and removable, before confirming.

**Révision** — Focused view: navigation dims but does not disappear, since sessions
are meant to be unhurried and leaving must never feel like a trap. One card at a
time, generous whitespace. Space to reveal, 1 to 4 to rate on desktop. Leaving
mid-session saves progress. No timer, no countdown, no "hurry".

**Progression** (M5: `progress` module — see `docs/modules/progress.md`) —
One card per course, no day list, no calendar. Each card carries two gauges
and one status line, and, like Aujourd'hui's own course cards, its course's
subject colour as a left border (`Subject colours` above) — this screen
carried no colour marker of any kind before.

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

**Lecteur** (M7 addition — see `docs/MILESTONES.md`) — Reached two ways, both
"Lire le cours": from a course's card on Mes cours (replacing the old "Voir
le texte" toggle, same `status === "done"` gate that button already had),
and from Notions du cours' own toolbar. Never from the nav: this is a
drill-down from a specific course, the same shape as Notions du cours, not
a top-level home, so it keeps its own back action rather than relying on
the nav's generic "Mes cours" the way Aujourd'hui and Calendrier do. That
back action reads plain **"Retour"**, not "Retour à mes cours": it returns
to wherever the screen was opened from — Mes cours, or Notions du cours
when opened from there — the same `fromDocumentId`-shaped mechanic
ProgressScreen already uses for its own two entry paths, and a label
naming one specific destination would lie on the other path.

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

**The reading surface itself is `--surface`, not `--canvas`** — this
screen's one deliberate deviation from "Content area on `--canvas`"
(Layout and responsiveness's own Desktop line): a full page of continuous
prose reads as a page, the way a card or a panel already does on
`--surface` elsewhere, not as bare canvas with text floating on it. No new
token: the token table has nothing named for "a full-height reading
surface" specifically, but `--surface` is already white and already used
for exactly this kind of contained, page-like area (its own row says
"Cards, sidebar, panels"); reusing it here is extending that row's
coverage, not inventing a token for a gap a new one would fix better.
Contrast improves, not just holds: `--text` on `--surface` measures
17.75:1 against 16.54:1 on `--canvas`, and `--text-muted` 4.97:1 against
4.64:1 — both already passed the 4.5:1 floor, this is a strict
improvement, not a trade.

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
- Contrast AA on all text. `--warning` is never a text colour on white at
  body size (it fails 3:1, let alone 4.5:1). `--accent` passes 4.5:1 as
  running text too (`#0F7B5F`, 5.23:1, `Colour` above) but still is not used
  that way, on purpose: its one job is marking the primary action, and
  letting it also colour arbitrary text — an error message, say — would blur that
  single meaning even where the numbers technically allow it.
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
- More than one `--accent` element inside the same card, or on a
  single-purpose screen that is not a grid of cards (`Colour`'s own note
  above on why a card grid reads differently)
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
