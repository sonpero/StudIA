import type { ChatModel } from "../domain/ports.js";
import type { Section } from "../domain/types.js";

// Not the docs/TESTING.md five-case table: that table asserts schema and
// refine handling on a generateObject-shaped port, and ChatModel has no
// schema -- it streams free text, no Result. These four cases instead cover
// this port's actual failure modes as described in docs/modules/tutor.md:
// a normal answer, an explicit refusal (the case the eval's refusal rate
// measures), a stream that dies mid-way (the partial-message rule), and an
// empty stream.
export type ChatFixtureCase = "valid" | "refusal" | "mid-stream-failure" | "empty";

export class FixtureChatModel implements ChatModel {
  constructor(private readonly fixtureCase: ChatFixtureCase = "valid") {}

  async *stream(_input: {
    question: string;
    sections: Section[];
    history: { role: "user" | "assistant"; content: string }[];
  }): AsyncIterable<string> {
    // A real ChatModel is never synchronous (it streams over the network);
    // this tick keeps the fixture honest about that instead of letting a
    // caller accidentally depend on synchronous iteration.
    await Promise.resolve();

    switch (this.fixtureCase) {
      case "valid":
        yield "La photosynthèse ";
        yield "est le processus ";
        yield "par lequel les plantes convertissent la lumière en énergie chimique.";
        return;
      case "refusal":
        yield "Ce cours ";
        yield "n'aborde pas ce sujet.";
        return;
      case "mid-stream-failure":
        yield "Voici le début ";
        yield "de la réponse, puis ";
        throw new Error("connexion interrompue");
      case "empty":
        return;
    }
  }
}
