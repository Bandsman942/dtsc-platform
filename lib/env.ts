import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => {
    if (value === "") return undefined;
    if (typeof value === "string" && value.startsWith("//")) return `https:${value}`;
    return value;
  },
  z.string().url().optional(),
);

const optionalEmailWithDefault = (fallback: string) =>
  z.preprocess((value) => (value === "" ? undefined : value), z.string().email().default(fallback));

const optionalString = (minimum = 1) =>
  z.preprocess((value) => (value === "" ? undefined : value), z.string().min(minimum).optional());

const envSchema = z.object({
  DATABASE_URL: optionalString(),
  OPENAI_API_KEY: optionalString(),
  OPENROUTER_API_KEY: optionalString(),
  OPENROUTER_BASE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.string().url().default("https://openrouter.ai/api/v1")),
  OPENROUTER_HTTP_REFERER: optionalUrl,
  OPENROUTER_APP_TITLE: optionalString(),
  AI_OPENROUTER_CERTIFIED_MODELS_JSON: optionalString(),
  AUTH_SECRET: z.string().optional(),
  APP_URL: optionalUrl,
  OPENAI_MODEL: z.string().min(1).default("gpt-5-nano"),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  OPENAI_MODEL_IDS: z.string().optional(),
  NEXT_PUBLIC_DEFAULT_MODEL: z.string().optional(),
  ADMIN_EMAIL: z.preprocess((value) => (value === "" ? undefined : value), z.string().email().optional()),
  DEFAULT_ADMIN_EMAIL: z.preprocess((value) => (value === "" ? undefined : value), z.string().email().optional()),
  DEFAULT_ADMIN_PASSWORD: optionalString(16),
  DEFAULT_ADMIN_BOOTSTRAP_ENABLED: z.preprocess((value) => value === true || value === "true" || value === "1", z.boolean()).default(false),
  DTSC_CONTACT_EMAIL: optionalEmailWithDefault("contact@dtsc-platform.com"),
  CONTACT_EMAIL: optionalEmailWithDefault("contact@dtsc-platform.com"),
  ZOHO_MAIL_WEBHOOK_URL: optionalUrl,
  ZOHO_OUTBOUND_MAIL_WEBHOOK_URL: optionalUrl,
  ZOHO_OUTGOING_WEBHOOK_SECRET: optionalString(24),
  ZOHO_MAIL_API_BASE_URL: optionalUrl,
  ZOHO_ACCOUNTS_API_BASE_URL: optionalUrl,
  ZOHO_MAIL_ACCOUNT_ID: optionalString(),
  ZOHO_MAIL_FROM_ADDRESS: z.preprocess((value) => (value === "" ? undefined : value), z.string().email().optional()),
  ZOHO_MAIL_CLIENT_ID: optionalString(),
  ZOHO_MAIL_CLIENT_SECRET: optionalString(),
  ZOHO_MAIL_REFRESH_TOKEN: optionalString(),
  MAISHAPAY_API_URL: optionalUrl,
  MAISHAPAY_GATEWAY_MODE: z.coerce.number().int().min(0).max(1).default(0),
  MAISHAPAY_PUBLIC_API_KEY: optionalString(),
  MAISHAPAY_SECRET_API_KEY: optionalString(),
  MAISHAPAY_DEFAULT_PROVIDER: z.enum(["MPESA", "ORANGE", "AIRTEL", "AFRICEL", "MTN"]).default("MPESA"),
  MAISHAPAY_CALLBACK_SECRET: optionalString(24),
  SUPABASE_STORAGE_URL: optionalUrl,
  SUPABASE_STORAGE_SERVICE_ROLE_KEY: optionalString(),
  SUPABASE_STORAGE_BUCKET: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).default("dtsc-documents")),
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalString(),
  LIVEKIT_API_KEY: optionalString(),
  LIVEKIT_API_SECRET: optionalString(),
  LIVEKIT_URL: optionalUrl,
  WHATSAPP_ACCESS_TOKEN: optionalString(),
  WHATSAPP_PHONE_NUMBER_ID: optionalString(),
  WHATSAPP_VERIFY_TOKEN: optionalString(),
  CRM_API_URL: optionalUrl,
  CRM_API_KEY: optionalString(),
});

export const env = envSchema.parse(process.env);

export function requireEnv(name: keyof typeof env) {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  if (name === "AUTH_SECRET" && String(value).length < 32) throw new Error("AUTH_SECRET must be at least 32 characters long");
  return String(value);
}
