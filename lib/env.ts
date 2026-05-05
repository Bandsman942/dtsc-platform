import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => {
    if (value === "") {
      return undefined;
    }
    if (typeof value === "string" && value.startsWith("//")) {
      return `https:${value}`;
    }
    return value;
  },
  z.string().url().optional()
);

const optionalEmailWithDefault = (fallback: string) =>
  z.preprocess((value) => (value === "" ? undefined : value), z.string().email().default(fallback));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  AUTH_SECRET: z.string().optional(),
  APP_URL: optionalUrl,
  OPENAI_MODEL: z.string().min(1).default("gpt-5-nano"),
  OPENAI_MODEL_IDS: z.string().optional(),
  NEXT_PUBLIC_DEFAULT_MODEL: z.string().optional(),
  ADMIN_EMAIL: z.preprocess((value) => (value === "" ? undefined : value), z.string().email().optional()),
  DTSC_CONTACT_EMAIL: optionalEmailWithDefault("contact@dtsc-platform.com"),
  ZOHO_MAIL_WEBHOOK_URL: optionalUrl,
  ZOHO_OUTBOUND_MAIL_WEBHOOK_URL: optionalUrl,
  ZOHO_OUTGOING_WEBHOOK_SECRET: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(24).optional()),
  ZOHO_MAIL_API_BASE_URL: optionalUrl,
  ZOHO_ACCOUNTS_API_BASE_URL: optionalUrl,
  ZOHO_MAIL_ACCOUNT_ID: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  ZOHO_MAIL_FROM_ADDRESS: z.preprocess((value) => (value === "" ? undefined : value), z.string().email().optional()),
  ZOHO_MAIL_CLIENT_ID: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  ZOHO_MAIL_CLIENT_SECRET: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  ZOHO_MAIL_REFRESH_TOKEN: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
});

export const env = envSchema.parse(process.env);

export function requireEnv(name: keyof typeof env) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  if (name === "AUTH_SECRET" && String(value).length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters long");
  }

  return String(value);
}
