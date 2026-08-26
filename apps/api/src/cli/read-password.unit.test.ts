import { Readable, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { readPassword } from "./read-password.js";

function fakeOutput(): { stream: Writable; written: () => string } {
  let written = "";
  const stream = new Writable({
    write(chunk: Buffer, _enc, callback) {
      written += chunk.toString("utf8");
      callback();
    },
  });
  return { stream, written: () => written };
}

describe("readPassword (non-TTY input, e.g. piped/scripted usage)", () => {
  it("resolves with the piped line, unmasked (no TTY to mask on)", async () => {
    const input = Readable.from(["s3cret-pass\n"]);
    const { stream: output } = fakeOutput();

    const value = await readPassword("Password: ", input, output);

    expect(value).toBe("s3cret-pass");
  });

  it("writes the prompt to the output stream", async () => {
    const input = Readable.from(["hello\n"]);
    const out = fakeOutput();

    await readPassword("Password: ", input, out.stream);

    expect(out.written()).toContain("Password: ");
  });
});
