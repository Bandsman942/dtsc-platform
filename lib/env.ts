import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(32).optional(),
  APP_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-5-nano"),
  OPENAI_MODEL_IDS: z.string().optional(),
  NEXT_PUBLIC_DEFAULT_MODEL: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
});

export const env = envSchema.parse(process.env);

export function requireEnv(name: keyof typeof env) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value);
}
