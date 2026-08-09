import { TicketPriority, UserRole, UserStatus } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { env } from "@/lib/env";
import { DTSC_INTERNAL_ORGANIZATION_ID } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { sendZohoOutboundMail } from "@/lib/zoho-mail";
import { notifyUsers } from "@/lib/notifications";
import type { AiToolExecutor } from "@/lib/ai/tools/types";

function ticketPriority(value: unknown): TicketPriority {
  const normalized = String(value || "MEDIUM").toUpperCase();
  if (normalized === TicketPriority.LOW) return TicketPriority.LOW;
  if (normalized === TicketPriority.HIGH) return TicketPriority.HIGH;
  if (normalized === TicketPriority.URGENT) return TicketPriority.URGENT;
  return TicketPriority.MEDIUM;
}

const sendContactEmail: AiToolExecutor = async ({ args, context }) => {
  const input = args as { subject: string; message: string };
  const user = await prisma.user.findUnique({
    where: { id: context.userId },
    select: { id: true, name: true, email: true, phone: true, companyName: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  const contactMessage = await prisma.contactMessage.create({
    data: {
      name: user.name,
      email: user.email,
      phone: user.phone || null,
      companyName: user.companyName || null,
      subject: input.subject,
      message: input.message,
      source: "ai_tool_gateway",
    },
  });

  const mail = await sendZohoOutboundMail({
    subject: input.subject,
    to: [env.CONTACT_EMAIL || env.DTSC_CONTACT_EMAIL],
    fromName: user.name,
    fromEmail: user.email,
    replyTo: user.email,
    source: "ai-tool-gateway-contact",
    heading: "Message transmis par l'assistant DTSC",
    message: [
      input.message,
      "",
      "Coordonnées client",
      `- Nom: ${user.name}`,
      `- Email: ${user.email}`,
      `- Téléphone: ${user.phone || "Non renseigné"}`,
      `- Organisation: ${user.companyName || "Non renseignée"}`,
      `- ID message: ${contactMessage.id}`,
    ].join("\n"),
  });

  await writeAuditLog({
    userId: context.userId,
    action: "AI_TOOL_CONTACT_EMAIL_SENT",
    entity: "ContactMessage",
    entityId: contactMessage.id,
    metadata: { toolCode: "DTSC_CONTACT_EMAIL_SEND", sent: mail.sent },
    request: context.request || undefined,
  });

  return { contactMessageId: contactMessage.id, sent: mail.sent };
};

const createSupportTicket: AiToolExecutor = async ({ args, context }) => {
  const input = args as { subject: string; message: string; priority: string };
  const ticket = await prisma.supportTicket.create({
    data: {
      userId: context.userId,
      organizationId: context.organizationId || null,
      subject: input.subject,
      description: input.message,
      priority: ticketPriority(input.priority),
    },
  });

  try {
    const supportUsers = await prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        OR: [{ role: UserRole.ADMIN }, { role: UserRole.SUPPORT }],
        organizationMemberships: { some: { organizationId: DTSC_INTERNAL_ORGANIZATION_ID, status: "ACTIVE", removedAt: null } },
      },
      select: { id: true },
    });
    await notifyUsers({
      userIds: supportUsers.map((supportUser) => supportUser.id),
      title: "Nouveau ticket support",
      body: input.subject,
      type: "SUPPORT",
      targetUrl: "/support",
      organizationId: DTSC_INTERNAL_ORGANIZATION_ID,
    });
  } catch (error) {
    console.error("AI Tool Gateway ticket notification failed", error);
  }

  await writeAuditLog({
    userId: context.userId,
    action: "AI_TOOL_SUPPORT_TICKET_CREATED",
    entity: "SupportTicket",
    entityId: ticket.id,
    metadata: { toolCode: "SUPPORT_TICKET_CREATE", priority: ticket.priority },
    request: context.request || undefined,
  });

  return { ticketId: ticket.id, status: ticket.status };
};

export const PRIVATE_ACTION_AI_TOOL_EXECUTORS: Record<string, AiToolExecutor> = {
  DTSC_CONTACT_EMAIL_SEND: sendContactEmail,
  SUPPORT_TICKET_CREATE: createSupportTicket,
};
