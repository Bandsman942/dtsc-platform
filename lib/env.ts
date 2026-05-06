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
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
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
  MAISHAPAY_API_URL: optionalUrl,
  MAISHAPAY_GATEWAY_MODE: z.coerce.number().int().min(0).max(1).default(0),
  MAISHAPAY_PUBLIC_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  MAISHAPAY_SECRET_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  MAISHAPAY_DEFAULT_PROVIDER: z.enum(["MPESA", "ORANGE", "AIRTEL", "AFRICEL", "MTN"]).default("MPESA"),
  MAISHAPAY_CALLBACK_SECRET: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(24).optional()),
  SUPABASE_STORAGE_URL: optionalUrl,
  SUPABASE_STORAGE_SERVICE_ROLE_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  SUPABASE_STORAGE_BUCKET: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).default("dtsc-documents")),
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  WHATSAPP_ACCESS_TOKEN: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  WHATSAPP_PHONE_NUMBER_ID: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  WHATSAPP_VERIFY_TOKEN: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  CRM_API_URL: optionalUrl,
  CRM_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
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
