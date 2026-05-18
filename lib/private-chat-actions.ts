import { TicketPriority, UserRole, UserStatus } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { env } from "@/lib/env";
import { getOpenAIModel } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { sendZohoOutboundMail } from "@/lib/zoho-mail";
import { notifyUsers } from "@/lib/notifications";

type ChatHistoryItem = {
  role: string;
  content: string;
};

type PrivateChatActionResult =
  | { handled: false }
  | { handled: true; reply: string; metadata: Record<string, unknown> };

type ExtractedAction = {
  action?: "NONE" | "SEND_EMAIL" | "CREATE_TICKET";
  ready?: boolean;
  missing?: string[];
  subject?: string;
  message?: string;
  priority?: string;
};

const directActionPattern =
  /\b(envoie|envoyer|transmets|transmettre|cr[eé]e|ouvrir|ouvre|soumettre)\b.*\b(ticket|support|mail|email|e-mail|contact@dtsc-platform\.com|message)\b/i;
const confirmationPattern = /\b(oui|ok|d'accord|vas-y|confirme|je confirme|envoie|cr[eé]e-le|cr[eé]e le|fais-le|faites-le)\b/i;

function clean(value?: string | null) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizePriority(value?: string | null): TicketPriority {
  const priority = clean(value).toUpperCase();
  if (priority === TicketPriority.LOW) {
    return TicketPriority.LOW;
  }
  if (priority === TicketPriority.HIGH) {
    return TicketPriority.HIGH;
  }
  if (priority === TicketPriority.URGENT) {
    return TicketPriority.URGENT;
  }
  return TicketPriority.MEDIUM;
}

async function extractAction(history: ChatHistoryItem[]) {
  const latestUserMessage = [...history].reverse().find((message) => message.role === "user")?.content || "";
  const previousAssistantMessage = [...history]
    .reverse()
    .find((message) => message.role === "assistant")?.content || "";
  const respondsToActionConfirmation =
    confirmationPattern.test(latestUserMessage) &&
    /\b(envoyer|envoie|mail|email|e-mail|ticket|support|cr[eé]er|cr[eé]e)\b/i.test(previousAssistantMessage);
  if (!directActionPattern.test(latestUserMessage) && !respondsToActionConfirmation) {
    return null;
  }
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAIModel(),
      instructions: [
        "Tu extrais une action à exécuter dans le chatbot privé DTSC.",
        "Retourne uniquement un JSON valide, sans markdown.",
        "Actions possibles: NONE, SEND_EMAIL, CREATE_TICKET.",
        "SEND_EMAIL cible toujours contact@dtsc-platform.com.",
        "CREATE_TICKET crée un ticket support DTSC.",
        "Ne mets ready=true que si l'utilisateur confirme explicitement qu'il faut envoyer ou créer maintenant.",
        "Champs minimaux pour SEND_EMAIL: subject et message.",
        "Champs minimaux pour CREATE_TICKET: subject, message et priority LOW/MEDIUM/HIGH/URGENT.",
        "Si une information manque ou si la confirmation explicite manque, mets ready=false et liste les champs manquants en français.",
      ].join("\n"),
      input: history.slice(-12).map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: message.content })),
      store: false,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const text =
    body.output_text ||
    (body.output || [])
      .flatMap((item) => item.content || [])
      .map((content) => content.text || "")
      .join("")
      .trim();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as ExtractedAction;
  } catch {
    return null;
  }
}

function missingInfoReply(action: ExtractedAction) {
  const missing = action.missing?.filter(Boolean) || [];
  const label = action.action === "CREATE_TICKET" ? "créer le ticket support" : "envoyer le mail à DTSC";
  return [
    `Je peux ${label}, mais il me manque encore quelques éléments.`,
    missing.length ? `Merci de préciser: ${missing.join(", ")}.` : "Merci de confirmer explicitement que je dois exécuter l'action maintenant.",
    "Dès que ces informations sont validées, je m'en occupe directement depuis votre espace DTSC.",
  ].join("\n\n");
}

export async function performPrivateChatActionFromHistory({
  history,
  userId,
  request,
}: {
  history: ChatHistoryItem[];
  userId: string;
  request: Request;
}): Promise<PrivateChatActionResult> {
  const action = await extractAction(history);
  if (!action || !action.action || action.action === "NONE") {
    return { handled: false };
  }
  if (!action.ready) {
    return { handled: true, reply: missingInfoReply(action), metadata: { action: "private_chat_action_missing", requestedAction: action.action } };
  }

  const subject = clean(action.subject);
  const message = clean(action.message);
  if (subject.length < 3 || message.length < 10) {
    return { handled: true, reply: missingInfoReply({ ...action, ready: false, missing: ["objet", "description détaillée"] }), metadata: { action: "private_chat_action_invalid", requestedAction: action.action } };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, companyName: true },
  });
  if (!user) {
    return { handled: true, reply: "Votre compte n'a pas pu être retrouvé pour finaliser cette action.", metadata: { action: "private_chat_action_user_missing" } };
  }

  if (action.action === "SEND_EMAIL") {
    const contactMessage = await prisma.contactMessage.create({
      data: {
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        companyName: user.companyName || null,
        subject,
        message,
        source: "private_chatbot",
      },
    });
    const mail = await sendZohoOutboundMail({
      subject,
      to: [env.CONTACT_EMAIL || env.DTSC_CONTACT_EMAIL],
      fromName: user.name,
      fromEmail: user.email,
      replyTo: user.email,
      source: "private-chatbot-contact",
      heading: "Message transmis depuis le chatbot privé DTSC",
      message: [
        message,
        "",
        "Coordonnées client",
        `- Nom: ${user.name}`,
        `- Email: ${user.email}`,
        `- Téléphone: ${user.phone || "Non renseigné"}`,
        `- Organisation: ${user.companyName || "Non renseignée"}`,
        `- ID message: ${contactMessage.id}`,
      ].join("\n"),
    }).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "Private chatbot mail failed" }));

    await writeAuditLog({
      userId,
      action: "PRIVATE_CHAT_EMAIL_SENT",
      entity: "ContactMessage",
      entityId: contactMessage.id,
      metadata: { subject, mail },
      request,
    });

    return {
      handled: true,
      reply: `Votre message a bien été transmis à l'équipe DTSC à l'adresse ${env.CONTACT_EMAIL || env.DTSC_CONTACT_EMAIL}. Un membre de l'équipe pourra vous recontacter prochainement.`,
      metadata: { action: "private_chat_email_sent", contactMessageId: contactMessage.id, mail },
    };
  }

  const priority = normalizePriority(action.priority);
  const ticket = await prisma.supportTicket.create({
    data: {
      userId,
      subject,
      description: message,
      priority,
    },
  });
  const supportUsers = await prisma.user.findMany({
    where: {
      status: UserStatus.ACTIVE,
      OR: [{ role: UserRole.ADMIN }, { role: UserRole.SUPPORT }],
    },
    select: { id: true },
  });
  await notifyUsers({
    userIds: supportUsers.map((supportUser) => supportUser.id),
    title: "Nouveau ticket support",
    body: subject,
    type: "SUPPORT",
    targetUrl: "/support",
  });
  await writeAuditLog({
    userId,
    action: "PRIVATE_CHAT_TICKET_CREATED",
    entity: "SupportTicket",
    entityId: ticket.id,
    metadata: { subject, priority },
    request,
  });

  return {
    handled: true,
    reply: `Votre ticket support a bien été créé sous la référence ${ticket.id}. Vous pouvez le suivre dans le module Support.`,
    metadata: { action: "private_chat_ticket_created", ticketId: ticket.id, priority },
  };
}
