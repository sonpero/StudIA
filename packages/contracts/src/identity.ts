import { z } from "zod";

export const loginRequestSchema = z.object({
  username: z.string().min(1).describe("Account username"),
  password: z.string().min(1).describe("Account password"),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const meResponseSchema = z.object({
  id: z.string(),
  username: z.string(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
