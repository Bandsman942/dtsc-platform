import type { AiTaskType } from "@/lib/ai/types";

export function classifyAiTask(content: string): AiTaskType {
  const normalized = content.toLocaleLowerCase();
  if (/\b(tradui|translate|translation)\b/.test(normalized)) return "TRANSLATION";
  if (/\b(code|typescript|javascript|sql|bug|api|prisma|react|next\.js)\b/.test(normalized)) return "CODE";
  if (/\b(résum|resume|synthèse|synthesize|summary)\b/.test(normalized)) return "SUMMARIZATION";
  if (/\b(extraire|extract|json|tableau structuré|structured)\b/.test(normalized)) return "EXTRACTION";
  if (/\b(document|pdf|fichier|pièce jointe|source|citation)\b/.test(normalized)) return "DOCUMENT_ANALYSIS";
  if (/\b(recherche|retrouve|chercher|search|donnée entreprise)\b/.test(normalized)) return "ENTERPRISE_SEARCH";
  if (/\b(crée|créer|modifie|modifier|envoie|envoyer|approuve|valide|outil|action)\b/.test(normalized)) return "TOOL_EXECUTION";
  if (/\b(pourquoi|analyse|compare|raisonne|stratégie|diagnostic)\b/.test(normalized)) return "REASONING";
  return "GENERAL_CHAT";
}
