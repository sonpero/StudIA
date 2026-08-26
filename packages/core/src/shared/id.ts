import { randomBytes } from "node:crypto";

export interface IdGenerator {
  next(): string;
}

// Hand-rolled: no dependency provides UUID v7 and Node's crypto only has
// randomUUID() (v4). Layout per RFC 9562: 48-bit ms timestamp, 4-bit version,
// 12-bit rand_a, 2-bit variant, 62-bit rand_b.
function generateUuidV7(): string {
  const ts = BigInt(Date.now());
  const rand = randomBytes(10);
  const bytes = Buffer.alloc(16);

  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);

  bytes[6] = 0x70 | (rand[0]! & 0x0f);
  bytes[7] = rand[1]!;
  bytes[8] = 0x80 | (rand[2]! & 0x3f);
  bytes[9] = rand[3]!;
  bytes[10] = rand[4]!;
  bytes[11] = rand[5]!;
  bytes[12] = rand[6]!;
  bytes[13] = rand[7]!;
  bytes[14] = rand[8]!;
  bytes[15] = rand[9]!;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const uuidV7Generator: IdGenerator = {
  next: generateUuidV7,
};
