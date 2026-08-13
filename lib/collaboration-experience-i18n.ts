import {
  translateCollaborationExperience,
  type CollaborationExperienceKey,
} from "@/lib/i18n";

export type { CollaborationExperienceKey } from "@/lib/i18n";

export function collaborationExperienceT(locale: string | null | undefined, key: CollaborationExperienceKey, vars?: Record<string, string | number>) {
  const template = translateCollaborationExperience(locale, key);
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(vars[name] ?? ""));
}
