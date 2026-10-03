import { describe, expect, it } from "vitest";
import { CARD_BUDGET, cardBudget } from "./card-budget.js";

const pages = (n: number) => n * CARD_BUDGET.charsPerPage;

describe("cardBudget", () => {
  it("gives the reference ranges at 5, 25 and 60 pages", () => {
    expect(cardBudget(pages(5))).toEqual({ keyNotions: { min: 15, max: 25 }, mcq: { min: 6, max: 10 }, open: { min: 2, max: 4 } });
    expect(cardBudget(pages(25))).toEqual({ keyNotions: { min: 40, max: 60 }, mcq: { min: 20, max: 30 }, open: { min: 8, max: 12 } });
    expect(cardBudget(pages(60))).toEqual({ keyNotions: { min: 70, max: 90 }, mcq: { min: 35, max: 45 }, open: { min: 12, max: 15 } });
  });

  it("interpolates linearly between two reference points, rounding to the nearest card", () => {
    // 15 pages: halfway between 5 and 25.
    expect(cardBudget(pages(15))).toEqual({ keyNotions: { min: 28, max: 43 }, mcq: { min: 13, max: 20 }, open: { min: 5, max: 8 } });
  });

  it("plateaus beyond 60 pages", () => {
    expect(cardBudget(pages(200))).toEqual(cardBudget(pages(60)));
  });

  it("never goes below the one-page ranges, even for an almost empty course", () => {
    expect(cardBudget(0)).toEqual(cardBudget(pages(1)));
    expect(cardBudget(pages(1))).toEqual({ keyNotions: { min: 5, max: 10 }, mcq: { min: 2, max: 4 }, open: { min: 1, max: 2 } });
  });

  it("never shrinks as the course grows, and every range has min <= max", () => {
    let previous = cardBudget(0);
    for (let chars = 0; chars <= pages(120); chars += 750) {
      const budget = cardBudget(chars);
      for (const kind of ["keyNotions", "mcq", "open"] as const) {
        expect(budget[kind].min).toBeLessThanOrEqual(budget[kind].max);
        expect(budget[kind].min).toBeGreaterThanOrEqual(previous[kind].min);
        expect(budget[kind].max).toBeGreaterThanOrEqual(previous[kind].max);
      }
      previous = budget;
    }
  });

  it("never allows more than the total cap of cards, whatever the length", () => {
    for (let chars = 0; chars <= pages(500); chars += 1_000) {
      const { keyNotions, mcq, open } = cardBudget(chars);
      expect(keyNotions.max + mcq.max + open.max).toBeLessThanOrEqual(CARD_BUDGET.totalCardCap);
    }
    expect(CARD_BUDGET.totalCardCap).toBe(150);
  });

  it("never asks for more essential or synthesis key notions than the fewest key notions allowed", () => {
    for (let chars = 0; chars <= pages(120); chars += 1_500) {
      const { keyNotions, mcq, open } = cardBudget(chars);
      expect(mcq.max).toBeLessThanOrEqual(keyNotions.min);
      expect(open.max).toBeLessThanOrEqual(keyNotions.min);
    }
  });
});
