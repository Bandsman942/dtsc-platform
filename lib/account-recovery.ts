import { createHash, randomBytes } from "node:crypto";

export const PASSWORD_RESET_TTL_MINUTES = 30;

export function normalizeAccountEmail(value: string) {
  return value.trim().toLowerCase();
}

export function createPasswordResetToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashPasswordResetToken(token) };
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function passwordPolicyError(password: string) {
  if (password.length < 12) return "Le mot de passe doit contenir au moins 12 caractères.";
  if (!/[a-z]/.test(password)) return "Ajoutez au moins une lettre minuscule.";
  if (!/[A-Z]/.test(password)) return "Ajoutez au moins une lettre majuscule.";
  if (!/[0-9]/.test(password)) return "Ajoutez au moins un chiffre.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Ajoutez au moins un caractère spécial.";
  return null;
}
