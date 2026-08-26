import { createHmac, timingSafeEqual } from "node:crypto";
import type { SessionCodec } from "../domain/ports.js";
import type { SessionPayload } from "../domain/types.js";

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

type EncodedPayload = SessionPayload & { exp: number };

function isEncodedPayload(value: unknown): value is EncodedPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record["userId"] === "string" && typeof record["sessionVersion"] === "number" && typeof record["exp"] === "number";
}

export class HmacSessionCodec implements SessionCodec {
  constructor(private readonly secret: string) {}

  sign(payload: SessionPayload, now: Date): string {
    const encoded: EncodedPayload = { ...payload, exp: now.getTime() + TTL_MS };
    const body = Buffer.from(JSON.stringify(encoded)).toString("base64url");
    const signature = this.signBody(body);
    return `${body}.${signature}`;
  }

  read(token: string, now: Date): SessionPayload | null {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, signature] = parts as [string, string];
    if (!this.hasValidSignature(body, signature)) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    if (!isEncodedPayload(parsed)) return null;
    if (parsed.exp <= now.getTime()) return null;

    return { userId: parsed.userId, sessionVersion: parsed.sessionVersion };
  }

  private signBody(body: string): string {
    return createHmac("sha256", this.secret).update(body).digest("base64url");
  }

  private hasValidSignature(body: string, signature: string): boolean {
    const expected = Buffer.from(this.signBody(body));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
