import { z } from "zod";

export const emailSchema = z.email().max(320);
export const passwordSchema = z.string().min(8).max(256);
export const usernameSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, and underscores only.")
  .transform((username) => username.toLowerCase());

export const registerSchema = z.object({
  password: passwordSchema,
  username: usernameSchema,
});

export const loginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const resetPasswordSchema = z.object({
  username: usernameSchema,
  recoveryKey: z.string().min(16).max(128),
  password: passwordSchema,
});

export const deleteAccountSchema = z.object({
  username: usernameSchema,
  recoveryKey: z.string().min(16).max(128),
});

export const spinSchema = z.object({
  runId: z.uuid().optional(),
  nonce: z.string().min(8).max(128),
});

export const runSchema = z.object({
  restart: z.boolean().optional(),
});

export const friendSchema = z.object({
  username: usernameSchema,
});
