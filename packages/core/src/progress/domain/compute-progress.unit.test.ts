import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeProgress, notionsBelowTarget, readinessProjectionDate } from "./compute-progress.js";
import { PROGRESS_NO_DEADLINE_HORIZON_DAYS, PROGRESS_RECENTLY_ADDED_DAYS, PROGRESS_STATUS_MARGIN, PROGRESS_TARGET_READINESS, type ProgressCardState, type ProgressDeadlineInput, type ProgressNotion } from "./types.js";

const NOW = new Date("2026-03-02T09:00:00.000Z");
const TODAY_KEY = "2026-03-02";
const OLD_CREATED_AT = "2025-01-01T00:00:00.000Z"; // far outside the recently-added window, unless a test overrides it

function dateKeyOffset(days: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenKeys(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00.000Z`);
  const to = Date.parse(`${toKey}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000);
}

// Independent recomputation of the target trajectory, from the same public
// constants computeProgress uses — not a copy of its control flow, just
// the one number needed to check behindByNotions against a real threshold
// instead of only bounding it loosely.
function expectedTarget(deadline: ProgressDeadlineInput, todayKey: string): number {
  const spanDays = daysBetweenKeys(deadline.setAt, deadline.date);
  const elapsedDays = daysBetweenKeys(deadline.setAt, todayKey);
  const fraction = spanDays <= 0 ? 1 : Math.min(Math.max(elapsedDays / spanDays, 0), 1);
  return PROGRESS_TARGET_READINESS * fraction;
}

function notionReadinessOf(notion: ProgressNotion): number {
  if (notion.cards.length === 0) return 0;
  return notion.cards.reduce((sum, c) => sum + c.retrievability, 0) / notion.cards.length;
}

// reviewed === false forces retrievability === 0 — the invariant progress's
// application layer is responsible for (docs/modules/progress.md's
// Coverage section: reviewed/retrievability come from the same row).
// Generating anything else would test a shape computeProgress is entitled
// to assume never happens.
const cardArb: fc.Arbitrary<ProgressCardState> = fc.oneof(
  fc.constant({ retrievability: 0, reviewed: false }),
  fc.double({ min: 0, max: 1, noNaN: true }).map((retrievability) => ({ retrievability, reviewed: true })),
);

function notionArb(id: string): fc.Arbitrary<ProgressNotion> {
  return fc.array(cardArb, { minLength: 0, maxLength: 4 }).map((cards) => ({ id, createdAt: OLD_CREATED_AT, cards }));
}

function notionsArb(maxCount = 6): fc.Arbitrary<ProgressNotion[]> {
  return fc.integer({ min: 0, max: maxCount }).chain((count) => fc.tuple(...Array.from({ length: count }, (_, i) => notionArb(`n${i}`))));
}

// setAt <= today <= date always, by construction (mirrors the real
// invariant: a deadline's setAt can't be in the future, and this generator
// only ever produces a deadline that is not yet in the past).
const deadlineArb: fc.Arbitrary<ProgressDeadlineInput | null> = fc.oneof(
  fc.constant(null),
  fc
    .record({ setAtDaysBeforeToday: fc.integer({ min: 0, max: 60 }), deadlineDaysFromToday: fc.integer({ min: 0, max: 60 }) })
    .map(({ setAtDaysBeforeToday, deadlineDaysFromToday }) => ({
      setAt: dateKeyOffset(-setAtDaysBeforeToday),
      date: dateKeyOffset(deadlineDaysFromToday),
    })),
);

const validParamsArb = fc.record({ notions: notionsArb(), deadline: deadlineArb });

describe("computeProgress — bounds and cross-field invariants", () => {
  it("coverage and readiness always land in [0, 1]", () => {
    fc.assert(
      fc.property(validParamsArb, ({ notions, deadline }) => {
        const result = computeProgress({ notions, deadline, now: NOW });
        if (!result.ok) return;
        expect(result.value.coverage).toBeGreaterThanOrEqual(0);
        expect(result.value.coverage).toBeLessThanOrEqual(1);
        expect(result.value.readiness).toBeGreaterThanOrEqual(0);
        expect(result.value.readiness).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("readiness <= coverage, always", () => {
    fc.assert(
      fc.property(validParamsArb, ({ notions, deadline }) => {
        const result = computeProgress({ notions, deadline, now: NOW });
        if (!result.ok) return;
        expect(result.value.readiness).toBeLessThanOrEqual(result.value.coverage);
      }),
    );
  });
});

describe("computeProgress — monotonicity", () => {
  it("raising any single card's retrievability, all else fixed, never decreases readiness", () => {
    fc.assert(
      fc.property(
        notionsArb(4).filter((notions) => notions.some((n) => n.cards.length > 0)),
        deadlineArb,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (notions, deadline, delta) => {
          const flatIndex: { notionIndex: number; cardIndex: number }[] = [];
          notions.forEach((n, ni) => n.cards.forEach((_, ci) => flatIndex.push({ notionIndex: ni, cardIndex: ci })));
          if (flatIndex.length === 0) return;
          const { notionIndex, cardIndex } = flatIndex[0]!;

          const before = computeProgress({ notions, deadline, now: NOW });
          const raised = notions.map((n, ni) =>
            ni !== notionIndex ? n : { ...n, cards: n.cards.map((c, ci) => (ci !== cardIndex ? c : { retrievability: Math.min(1, c.retrievability + delta), reviewed: true })) },
          );
          const after = computeProgress({ notions: raised, deadline, now: NOW });

          if (!before.ok || !after.ok) return;
          expect(after.value.readiness).toBeGreaterThanOrEqual(before.value.readiness);
        },
      ),
    );
  });
});

describe("computeProgress — 4a: readiness and coverage do not depend on now", () => {
  it("with notions (and every card's retrievability) held fixed, readiness and coverage are identical for any two valid `now` values", () => {
    fc.assert(
      fc.property(notionsArb(), deadlineArb, fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 9 }), (notions, deadline, offsetDays1, offsetDays2) => {
        const now1 = new Date(NOW);
        now1.setUTCDate(now1.getUTCDate() + offsetDays1);
        const now2 = new Date(NOW);
        now2.setUTCDate(now2.getUTCDate() + offsetDays2);

        const r1 = computeProgress({ notions, deadline, now: now1 });
        const r2 = computeProgress({ notions, deadline, now: now2 });
        // deadlineArb's shortest span is 0 days from NOW; the +0..9 day
        // shift here could in principle cross into deadline-in-past for a
        // deadline generated exactly at NOW's date. When either call hits
        // that branch there is no readiness/coverage to compare — this
        // property is about the Ok path only, deadline-in-past is its own
        // test below.
        if (!r1.ok || !r2.ok) return;

        expect(r2.value.readiness).toBe(r1.value.readiness);
        expect(r2.value.coverage).toBe(r1.value.coverage);
      }),
    );
  });
});

describe("computeProgress — determinism", () => {
  it("two identical calls deep-equal, including behindByNotions and recentlyAddedUnreviewed", () => {
    fc.assert(
      fc.property(validParamsArb, ({ notions, deadline }) => {
        const a = computeProgress({ notions, deadline, now: NOW });
        const b = computeProgress({ notions, deadline, now: NOW });
        expect(a).toEqual(b);
      }),
    );
  });
});

describe("computeProgress — status, 4bis: with a deadline and no activity, status never improves as now advances", () => {
  const STATUS_ORDER = { behind: 0, "on-track": 1, ahead: 2 } as const;

  it("status is non-increasing under ahead > on-track > behind as now moves from setAt to the deadline date", () => {
    fc.assert(
      fc.property(
        notionsArb(5),
        fc.integer({ min: 1, max: 60 }), // spanDays
        fc.array(fc.integer({ min: 0, max: 60 }), { minLength: 2, maxLength: 2 }),
        (notions, spanDays, offsets) => {
          const deadline: ProgressDeadlineInput = { setAt: dateKeyOffset(-spanDays), date: dateKeyOffset(0) };
          const o1 = Math.min(Math.min(...offsets), spanDays);
          const o2 = Math.min(Math.max(...offsets), spanDays);
          const now1 = new Date(NOW);
          now1.setUTCDate(now1.getUTCDate() - spanDays + o1);
          const now2 = new Date(NOW);
          now2.setUTCDate(now2.getUTCDate() - spanDays + o2);

          const r1 = computeProgress({ notions, deadline, now: now1 });
          const r2 = computeProgress({ notions, deadline, now: now2 });
          if (!r1.ok || !r2.ok) return;
          if (r1.value.status === "no-deadline" || r2.value.status === "no-deadline") return;

          expect(STATUS_ORDER[r2.value.status]).toBeLessThanOrEqual(STATUS_ORDER[r1.value.status]);
        },
      ),
    );
  });
});

describe("computeProgress — behindByNotions", () => {
  it("equals exactly the count of notions with R(notion) < target(now); 0 iff status !== 'behind'; >= 1 when it is", () => {
    fc.assert(
      fc.property(
        notionsArb(),
        deadlineArb.filter((d): d is ProgressDeadlineInput => d !== null),
        (notions, deadline) => {
          const result = computeProgress({ notions, deadline, now: NOW });
          if (!result.ok) return;

          if (result.value.status !== "behind") {
            expect(result.value.behindByNotions).toBe(0);
            return;
          }
          expect(result.value.behindByNotions).toBeGreaterThanOrEqual(1);

          // Independent recomputation, not just a loose bound: this is
          // what actually distinguishes "count of notions below target"
          // from a wrong-but-plausible stand-in like "count = total
          // notions whenever behind" — both would pass the >= 1 check
          // above on their own.
          const target = expectedTarget(deadline, TODAY_KEY);
          const expectedCount = notions.filter((n) => notionReadinessOf(n) < target).length;
          expect(result.value.behindByNotions).toBe(expectedCount);
        },
      ),
    );
  });
});

describe("computeProgress — recentlyAddedUnreviewed", () => {
  it("only counts uncovered notions created within PROGRESS_RECENTLY_ADDED_DAYS of now, independent of the deadline branch", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ daysAgo: fc.integer({ min: 0, max: 20 }), reviewed: fc.boolean() }), { minLength: 0, maxLength: 8 }),
        deadlineArb,
        (specs, deadline) => {
          const notions: ProgressNotion[] = specs.map((spec, i) => ({
            id: `n${i}`,
            createdAt: dateKeyOffset(-spec.daysAgo),
            cards: [{ retrievability: spec.reviewed ? 0.5 : 0, reviewed: spec.reviewed }],
          }));
          const result = computeProgress({ notions, deadline, now: NOW });
          if (!result.ok) return;

          const expected = specs.filter((s) => !s.reviewed && s.daysAgo <= PROGRESS_RECENTLY_ADDED_DAYS).length;
          expect(result.value.recentlyAddedUnreviewed).toBe(expected);
        },
      ),
    );
  });

  it("is 0 for zero notions", () => {
    const result = computeProgress({ notions: [], deadline: null, now: NOW });
    expect(result.ok && result.value.recentlyAddedUnreviewed).toBe(0);
  });
});

describe("computeProgress — deadline-in-past", () => {
  it("returns Err iff deadline.date is strictly before today; today itself is not in the past — boundary included in the generator, not left to a dedicated example alone", () => {
    fc.assert(
      fc.property(notionsArb(), fc.integer({ min: 0, max: 60 }), (notions, daysInPast) => {
        const deadline: ProgressDeadlineInput = { setAt: dateKeyOffset(-daysInPast - 10), date: dateKeyOffset(-daysInPast) };
        const result = computeProgress({ notions, deadline, now: NOW });
        if (daysInPast > 0) {
          expect(result).toEqual({ ok: false, error: { kind: "deadline-in-past" } });
        } else {
          expect(result.ok).toBe(true);
        }
      }),
    );
  });
});

describe("computeProgress — edge cases, never NaN", () => {
  it("zero notions with a deadline: on-track, not behind", () => {
    const deadline: ProgressDeadlineInput = { setAt: dateKeyOffset(-10), date: dateKeyOffset(10) };
    const result = computeProgress({ notions: [], deadline, now: NOW });
    expect(result).toEqual({ ok: true, value: { coverage: 0, readiness: 0, status: "on-track", behindByNotions: 0, recentlyAddedUnreviewed: 0 } });
  });

  it("zero notions, no deadline: no-deadline, not on-track", () => {
    const result = computeProgress({ notions: [], deadline: null, now: NOW });
    expect(result).toEqual({ ok: true, value: { coverage: 0, readiness: 0, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } });
  });

  it("deadline set for today (spanDays === 0): target is PROGRESS_TARGET_READINESS immediately, no NaN", () => {
    const deadline: ProgressDeadlineInput = { setAt: TODAY_KEY, date: TODAY_KEY };
    const notions: ProgressNotion[] = [{ id: "n1", createdAt: OLD_CREATED_AT, cards: [{ retrievability: 0.5, reviewed: true }] }];
    const result = computeProgress({ notions, deadline, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Number.isNaN(result.value.readiness)).toBe(false);
    expect(result.value.status).toBe("behind"); // 0.5 < PROGRESS_TARGET_READINESS
  });

  it("all notions never seen: coverage 0, readiness 0, no NaN, no thrown error", () => {
    const deadline: ProgressDeadlineInput = { setAt: dateKeyOffset(-10), date: dateKeyOffset(10) };
    const notions: ProgressNotion[] = [
      { id: "n1", createdAt: OLD_CREATED_AT, cards: [{ retrievability: 0, reviewed: false }] },
      { id: "n2", createdAt: OLD_CREATED_AT, cards: [] },
    ];
    const result = computeProgress({ notions, deadline, now: NOW });
    expect(result).toEqual({
      ok: true,
      value: { coverage: 0, readiness: 0, status: "behind", behindByNotions: 2, recentlyAddedUnreviewed: 0 },
    });
  });
});

// Sanity checks that the exported constants are what the rest of the spec
// assumes — not properties, just guards against a silent rename.
describe("computeProgress — exported constants", () => {
  it("has the documented values", () => {
    expect(PROGRESS_STATUS_MARGIN).toBe(0.1);
    expect(PROGRESS_RECENTLY_ADDED_DAYS).toBe(7);
    expect(PROGRESS_TARGET_READINESS).toBe(0.9);
    expect(PROGRESS_NO_DEADLINE_HORIZON_DAYS).toBe(14);
  });
});

// M6 (docs/modules/progress.md's "notionsBelowTarget" section, docs/modules/
// workspace.md's "Why workspace composes, not review"): same selection
// behindByNotions counts, exposed as identities for workspace's TodayView.
// Must never disagree with computeProgress, or two screens reading the same
// computation would show contradictory things for the same course.
describe("notionsBelowTarget — coherent with computeProgress by construction", () => {
  it("non-empty iff computeProgress's status is 'behind' for the same input, and always the same length as behindByNotions", () => {
    fc.assert(
      fc.property(validParamsArb, ({ notions, deadline }) => {
        const progress = computeProgress({ notions, deadline, now: NOW });
        const belowTarget = notionsBelowTarget({ notions, deadline, now: NOW });

        expect(belowTarget.ok).toBe(progress.ok);
        if (!progress.ok || !belowTarget.ok) return;

        expect(belowTarget.value.length > 0).toBe(progress.value.status === "behind");
        expect(belowTarget.value.length).toBe(progress.value.behindByNotions);
      }),
    );
  });

  it("returns the same Err as computeProgress for a deadline in the past", () => {
    fc.assert(
      fc.property(notionsArb(), fc.integer({ min: 1, max: 60 }), (notions, daysInPast) => {
        const deadline: ProgressDeadlineInput = { setAt: dateKeyOffset(-daysInPast - 10), date: dateKeyOffset(-daysInPast) };
        expect(notionsBelowTarget({ notions, deadline, now: NOW })).toEqual({ ok: false, error: { kind: "deadline-in-past" } });
      }),
    );
  });

  it("is always empty with no deadline, regardless of how low any notion's R is", () => {
    fc.assert(
      fc.property(notionsArb(), (notions) => {
        expect(notionsBelowTarget({ notions, deadline: null, now: NOW })).toEqual({ ok: true, value: [] });
      }),
    );
  });
});

describe("notionsBelowTarget — edge cases and identity", () => {
  it("is empty for zero notions, with or without a deadline", () => {
    const deadline: ProgressDeadlineInput = { setAt: dateKeyOffset(-10), date: dateKeyOffset(10) };
    expect(notionsBelowTarget({ notions: [], deadline, now: NOW })).toEqual({ ok: true, value: [] });
    expect(notionsBelowTarget({ notions: [], deadline: null, now: NOW })).toEqual({ ok: true, value: [] });
  });

  it("names exactly the notions with R(notion) < target(now), in the order they were given — not just a count", () => {
    const deadline: ProgressDeadlineInput = { setAt: dateKeyOffset(-10), date: dateKeyOffset(10) };
    const notions: ProgressNotion[] = [
      { id: "n1", createdAt: OLD_CREATED_AT, cards: [{ retrievability: 0.1, reviewed: true }] },
      { id: "n2", createdAt: OLD_CREATED_AT, cards: [{ retrievability: 0.99, reviewed: true }] },
      { id: "n3", createdAt: OLD_CREATED_AT, cards: [{ retrievability: 0, reviewed: false }] },
    ];

    const result = notionsBelowTarget({ notions, deadline, now: NOW });

    expect(result).toEqual({ ok: true, value: ["n1", "n3"] });
  });
});

describe("readinessProjectionDate", () => {
  it("with a deadline, projects to the deadline's own date, not now", () => {
    const deadline: ProgressDeadlineInput = { setAt: dateKeyOffset(-10), date: dateKeyOffset(20) };
    expect(readinessProjectionDate(deadline, NOW).toISOString().slice(0, 10)).toBe(dateKeyOffset(20));
  });

  it("without a deadline, projects to now + PROGRESS_NO_DEADLINE_HORIZON_DAYS", () => {
    expect(readinessProjectionDate(null, NOW).toISOString().slice(0, 10)).toBe(dateKeyOffset(PROGRESS_NO_DEADLINE_HORIZON_DAYS));
  });
});
