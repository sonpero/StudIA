import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import type { ReadStream } from "node:tty";

interface RawModeReadable extends Readable {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?(mode: boolean): ReadStream;
}

function isRawModeCapable(input: Readable): input is Required<Pick<RawModeReadable, "setRawMode">> & Readable {
  const candidate = input as RawModeReadable;
  return Boolean(candidate.isTTY) && typeof candidate.setRawMode === "function";
}

const ENTER = new Set(["\n", "\r", "\u0004"]); // \u0004 = Ctrl-D (EOF)
const INTERRUPT = "\u0003"; // Ctrl-C
const BACKSPACE = new Set(["\u007f", "\b"]);

// Masks keystrokes with `*` when stdin is a real terminal. Falls back to a
// plain (unmasked) readline prompt when it isn't — piped/scripted input, as
// used in tests and CI, has no terminal to mask on in the first place.
export async function readPassword(
  prompt: string,
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): Promise<string> {
  if (!isRawModeCapable(input)) {
    const rl = createInterface({ input, output });
    const value = await rl.question(prompt);
    rl.close();
    return value;
  }

  const tty = input;
  return new Promise((resolve) => {
    output.write(prompt);
    const wasRaw = (input as RawModeReadable).isRaw ?? false;
    tty.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");

    let value = "";
    const cleanup = () => {
      tty.setRawMode(wasRaw);
      input.pause();
      input.removeListener("data", onData);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (ENTER.has(char)) {
          cleanup();
          output.write("\n");
          resolve(value);
          return;
        }
        if (char === INTERRUPT) {
          cleanup();
          process.exit(1);
        }
        if (BACKSPACE.has(char)) {
          if (value.length > 0) {
            value = value.slice(0, -1);
            output.write("\b \b");
          }
          continue;
        }
        value += char;
        output.write("*");
      }
    };
    input.on("data", onData);
  });
}
