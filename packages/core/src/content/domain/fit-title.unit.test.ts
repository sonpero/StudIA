import { describe, expect, it } from "vitest";
import { fitTitle } from "./fit-title.js";

describe("fitTitle", () => {
  it("keeps the real production title that failed A2A (82 characters) unchanged", () => {
    const title = "Inconvénients d'A2A : sécurité à la charge de l'implémenteur et webhooks exigeants";
    expect(title).toHaveLength(82);

    expect(fitTitle(title)).toBe(title);
  });

  it("keeps a title of exactly 100 characters unchanged", () => {
    const title = `${"x".repeat(50)} ${"y".repeat(49)}`;
    expect(title).toHaveLength(100);

    expect(fitTitle(title)).toBe(title);
  });

  it("shortens a title of 101 characters", () => {
    expect(fitTitle(`${"x".repeat(50)} ${"y".repeat(50)}`)).toBe("x".repeat(50));
  });

  it("cuts at the last space within 100 characters, keeping whole words", () => {
    const title = "Sécurité d'A2A : authentification des agents, jetons à portée réduite, échange de jetons (RFC 8693) et audience restreinte";

    expect(fitTitle(title)).toBe("Sécurité d'A2A : authentification des agents, jetons à portée réduite, échange de jetons (RFC 8693)");
  });

  it("keeps a word that ends exactly at the 100th character", () => {
    expect(fitTitle(`${"x".repeat(50)} ${"y".repeat(49)} zzz`)).toBe(`${"x".repeat(50)} ${"y".repeat(49)}`);
  });

  it("never ends on a linking word, removing several in a row", () => {
    expect(fitTitle(`${"x".repeat(92)} de la sécurité`)).toBe("x".repeat(92));
  });

  it("recognises a linking word whatever its case", () => {
    expect(fitTitle(`${"x".repeat(96)} Et ${"y".repeat(10)}`)).toBe("x".repeat(96));
  });

  it("recognises English linking words too", () => {
    expect(fitTitle(`${"x".repeat(92)} and the ${"y".repeat(10)}`)).toBe("x".repeat(92));
  });

  it("only removes a whole linking word, not a word that ends like one", () => {
    expect(fitTitle(`${"x".repeat(90)} paquet ${"y".repeat(10)}`)).toBe(`${"x".repeat(90)} paquet`);
  });

  it("never ends on punctuation", () => {
    expect(fitTitle(`${"x".repeat(95)} : ${"y".repeat(20)}`)).toBe("x".repeat(95));
    expect(fitTitle(`${"x".repeat(94)} y, ${"z".repeat(20)}`)).toBe(`${"x".repeat(94)} y`);
  });

  it("removes punctuation and linking words alternating at the end", () => {
    expect(fitTitle(`${"x".repeat(88)} et, de : ${"y".repeat(20)}`)).toBe("x".repeat(88));
  });

  it("drops a parenthesis the cut left open, with what follows it", () => {
    expect(fitTitle(`${"x".repeat(85)} (voir la section ${"y".repeat(20)})`)).toBe("x".repeat(85));
  });

  it("drops French quotation marks the cut left open, with what follows them", () => {
    expect(fitTitle(`${"x".repeat(85)} « voir la section ${"y".repeat(20)} »`)).toBe("x".repeat(85));
  });

  it("cuts a title with no space in its first 100 characters at exactly 100", () => {
    expect(fitTitle("x".repeat(150))).toBe("x".repeat(100));
  });

  it("falls back to the plain word cut when trimming would leave almost nothing", () => {
    const title = "de ".repeat(40).trim();

    expect(fitTitle(title)).toBe("de ".repeat(33).trim());
  });

  it("never returns more than 100 characters", () => {
    const titles = [
      "x".repeat(300),
      `${"mot ".repeat(60)}fin`,
      `${"x".repeat(99)} ${"y".repeat(99)}`,
      `(${"x".repeat(200)})`,
    ];

    for (const title of titles) expect(fitTitle(title).length).toBeLessThanOrEqual(100);
  });
});
