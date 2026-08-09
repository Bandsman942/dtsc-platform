import { env } from "@/lib/env";
import { getOpenAIModel } from "@/lib/openai";
import { getSession } from "@/lib/auth";
import { executeAiTool } from "@/lib/ai/tools/execute";

export type ChatHistoryItem = {
  id?: string;
  conversationId?: string;
  role: string;
  content: string;
};

export type PrivateChatActionResult =
  | { handled: false }
  | { handled: true; reply: string; metadata: Record<string, unknown> };

type ExtractedAction = {
  action?: "NONE" | "SEND_EMAIL" | "CREATE_TICKET";
  missing?: string[];
  subject?: string;
  message?: string;
  priority?: string;
};

const directActionPattern =
  /\b(envoie|envoyer|transmets|transmettre|cr[eé]e|ouvrir|ouvre|soumettre)\b.*\b(ticket|support|mail|email|e-mail|contact@dtsc-platform\.com|message)\b/i;

function clean(value?: string | null) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizePriority(value?: string | null) {
  const priority = clean(value).toUpperCase();
  return ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(priority) ? priority : "MEDIUM";
}

async function extractAction(history: ChatHistoryItem[]) {
  const latestUserMessage = [...history].reverse().find((message) => message.role === "user")?.content || "";
  if (!directActionPattern.test(latestUserMessage) || !env.OPENAI_API_KEY) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: getOpenAIModel(),
      instructions: [
        "Tu extrais uniquement une intention d'action demandée dans le chatbot privé DTSC.",
        "Retourne uniquement un JSON valide, sans markdown.",
        "Actions possibles: NONE, SEND_EMAIL, CREATE_TICKET.",
        "SEND_EMAIL cible toujours contact@dtsc-platform.com.",
        "CREATE_TICKET prépare un ticket support DTSC.",
        "Tu n'autorises jamais l'exécution. La confirmation est gérée séparément par le Tool Gateway.",
        "Champs minimaux pour SEND_EMAIL: subject et message.",
        "Champs minimaux pour CREATE_TICKET: subject, message et priority LOW/MEDIUM/HIGH/URGENT.",
        "Si une information manque, liste les champs manquants en français.",
      ].join("\n"),
      input: history.slice(-12).map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: message.content })),
      store: false,
    }),
  });
  if (!response.ok) return null;

  const body = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const text = body.output_text || (body.output || []).flatMap((item) => item.content || []).map((content) => content.text || "").join("").trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as ExtractedAction;
  } catch {
    return null;
  }
}

function missingInfoReply(action: ExtractedAction) {
  const missing = action.missing?.filter(Boolean) || [];
  const label = action.action === "CREATE_TICKET" ? "préparer le ticket support" : "préparer le mail à DTSC";
  return [
    `Je peux ${label}, mais il me manque encore quelques éléments.`,
    missing.length ? `Merci de préciser : ${missing.join(", ")}.` : "Merci de préciser l’objet et le contenu de l’action.",
  ].join("\n\n");
}

export async function performPrivateChatActionFromHistory({
  history,
  userId,
  organizationId = null,
  conversationId = null,
  request,
}: {
  history: ChatHistoryItem[];
  userId: string;
  organizationId?: string | null;
  conversationId?: string | null;
  request: Request;
}): Promise<PrivateChatActionResult> {
  const action = await extractAction(history);
  if (!action || !action.action || action.action === "NONE") return { handled: false };

  const subject = clean(action.subject);
  const message = clean(action.message);
  if (subject.length < 3 || message.length < 10) {
    return {
      handled: true,
      reply: missingInfoReply({ ...action, missing: action.missing?.length ? action.missing : ["objet", "description détaillée"] }),
      metadata: { action: "private_chat_action_missing", requestedAction: action.action },
    };
  }

  const session = await getSession();
  if (!session || session.userId !== userId) {
    return { handled: true, reply: "Votre session ne permet pas de préparer cette action.", metadata: { action: "private_chat_action_session_denied" } };
  }
  if (organizationId && (session.activeContext !== "ORGANIZATION" || session.activeOrganizationId !== organizationId)) {
    return { handled: true, reply: "Le contexte entreprise actif ne correspond plus à cette conversation.", metadata: { action: "private_chat_action_context_denied" } };
  }

  const latestUserTurn = [...history].reverse().find((item) => item.role === "user");
  const boundConversationId = conversationId || latestUserTurn?.conversationId || history.find((item) => item.conversationId)?.conversationId || null;
  const turnId = latestUserTurn?.id || null;
  const toolCode = action.action === "CREATE_TICKET" ? "SUPPORT_TICKET_CREATE" : "DTSC_CONTACT_EMAIL_SEND";
  const args = action.action === "CREATE_TICKET"
    ? { subject, message, priority: normalizePriority(action.priority) }
    : { subject, message };
  const preparation = await executeAiTool({
    toolCode,
    args,
    context: {
      session,
      userId,
      organizationId,
      conversationId: boundConversationId,
      turnId,
      request,
    },
  });

  if (preparation.status !== "CONFIRMATION_REQUIRED") {
    return {
      handled: true,
      reply: "Cette action ne peut pas être préparée pour le moment.",
      metadata: { action: "private_chat_action_prepare_failed", toolCode, reasonCode: preparation.reasonCode || preparation.status },
    };
  }

  const confirmation = preparation.result as { confirmationId?: string; expiresAt?: string } | undefined;
  const actionLabel = toolCode === "SUPPORT_TICKET_CREATE" ? "créer ce ticket support" : "envoyer ce message à l’équipe DTSC";
  return {
    handled: true,
    reply: `L’action est prête. Vérifiez les informations affichées puis utilisez le contrôle de confirmation pour ${actionLabel}. Une réponse comme « oui » ou « vas-y » dans le chat ne déclenche pas l’action.`,
    metadata: {
      action: "private_chat_action_confirmation_required",
      toolCode,
      confirmationId: confirmation?.confirmationId || null,
      expiresAt: confirmation?.expiresAt || null,
      conversationId: boundConversationId,
      turnId,
      subject,
    },
  };
}
