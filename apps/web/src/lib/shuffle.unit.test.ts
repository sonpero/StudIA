import { describe, expect, it } from "vitest";
import { shuffle } from "./shuffle.js";

// mulberry32: a seeded generator, so the distribution test below is exact
// and never flaky (Math.random would make it pass "almost always").
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const options = ["Bonne réponse", "Leurre A", "Leurre B", "Leurre C"];

describe("shuffle", () => {
  it("keeps every option, the correct one exactly once, and leaves the input untouched", () => {
    const input = [...options];
    const shuffled = shuffle(input, seeded(1));
    expect([...shuffled].sort()).toEqual([...options].sort());
    expect(shuffled.filter((o) => o === "Bonne réponse")).toHaveLength(1);
    expect(input).toEqual(options);
  });

  it("is Fisher-Yates driven by the injected generator: always 0 rotates the first item to the end", () => {
    // i=3: j=0 swaps 0↔3, i=2: j=0 swaps 0↔2, i=1: j=0 swaps 0↔1.
    expect(shuffle(["a", "b", "c", "d"], () => 0)).toEqual(["b", "c", "d", "a"]);
    // Just under 1: j = i every time, nothing moves.
    expect(shuffle(["a", "b", "c", "d"], () => 0.999999)).toEqual(["a", "b", "c", "d"]);
  });

  it("over 10 000 draws, the correct answer lands in each of the 4 positions 23 % to 27 % of the time", () => {
    const random = seeded(42);
    const counts = [0, 0, 0, 0];
    for (let draw = 0; draw < 10_000; draw++) counts[shuffle(options, random).indexOf("Bonne réponse")]! += 1;
    for (const count of counts) {
      expect(count / 10_000).toBeGreaterThanOrEqual(0.23);
      expect(count / 10_000).toBeLessThanOrEqual(0.27);
    }
  });

  it("handles no or one item", () => {
    expect(shuffle([], seeded(3))).toEqual([]);
    expect(shuffle(["seule"], seeded(3))).toEqual(["seule"]);
  });
});
