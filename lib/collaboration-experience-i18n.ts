import {
  translateCollaborationExperience,
  type CollaborationExperienceKey,
} from "@/lib/i18n";

export type { CollaborationExperienceKey } from "@/lib/i18n";

export function collaborationExperienceT(locale: string | null | undefined, key: CollaborationExperienceKey) {
  return translateCollaborationExperience(locale, key);
}
