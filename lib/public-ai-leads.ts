import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { publicDtscLeadSchema } from "@/lib/validators";
import { sendZohoOutboundMail } from "@/lib/zoho-mail";

type LeadInput = unknown;

function clean(value?: string | null) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function preferNewValue(current: string | null | undefined, next?: string) {
  const cleanNext = clean(next);
  return cleanNext || current || null;
}

export async function createLeadAndNotify(input: LeadInput) {
  const parsed = publicDtscLeadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Les informations minimales ne sont pas encore complètes. Il faut au minimum le nom, l'email, le service recherché et la description du besoin.",
    };
  }

  const data = parsed.data;
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email: data.email } });
  const source = "landing_page_ai_agent";
  const lead = await prisma.newsletterSubscriber.upsert({
    where: { email: data.email },
    update: {
      name: preferNewValue(existing?.name, data.fullName) || data.fullName,
      companyName: preferNewValue(existing?.companyName, data.organization),
      phone: preferNewValue(existing?.phone, data.phone),
      jobTitle: preferNewValue(existing?.jobTitle, data.role),
      interest: preferNewValue(existing?.interest, data.requestedService),
      requestedService: preferNewValue(existing?.requestedService, data.requestedService),
      needDescription: preferNewValue(existing?.needDescription, data.needDescription),
      urgency: preferNewValue(existing?.urgency, data.urgency),
      estimatedBudget: preferNewValue(existing?.estimatedBudget, data.estimatedBudget),
      preferredContactChannel: preferNewValue(existing?.preferredContactChannel, data.preferredContactChannel),
      aiSummary: preferNewValue(existing?.aiSummary, data.summary),
      source,
      signupPage: "landing",
      commercialConsent: true,
      status: existing?.status === "CONVERTED" ? existing.status : "new_ai_lead",
    },
    create: {
      name: data.fullName,
      email: data.email,
      companyName: clean(data.organization) || null,
      phone: clean(data.phone) || null,
      jobTitle: clean(data.role) || null,
      interest: data.requestedService,
      requestedService: data.requestedService,
      needDescription: data.needDescription,
      urgency: clean(data.urgency) || null,
      estimatedBudget: clean(data.estimatedBudget) || null,
      preferredContactChannel: clean(data.preferredContactChannel) || null,
      aiSummary: clean(data.summary) || null,
      source,
      signupPage: "landing",
      consent: false,
      commercialConsent: true,
      status: "new_ai_lead",
    },
  });

  const contactEmail = env.CONTACT_EMAIL || env.DTSC_CONTACT_EMAIL;
  const date = new Date().toLocaleString("fr-FR");
  const rows = [
    ["Nom", data.fullName],
    ["Organisation", data.organization || "Non renseignée"],
    ["Email", data.email],
    ["Téléphone", data.phone || "Non renseigné"],
    ["Fonction", data.role || "Non renseignée"],
    ["Service demandé", data.requestedService],
    ["Description du besoin", data.needDescription],
    ["Urgence", data.urgency || "Non renseignée"],
    ["Budget estimatif", data.estimatedBudget || "Non renseigné"],
    ["Canal de contact préféré", data.preferredContactChannel || "Non renseigné"],
    ["Source", source],
    ["Date", date],
    ["Résumé IA", data.summary || "Non renseigné"],
  ];

  const mail = await sendZohoOutboundMail({
    subject: "Nouveau prospect qualifié par l'agent IA DTSC",
    to: [contactEmail],
    fromName: data.fullName,
    fromEmail: data.email,
    replyTo: data.email,
    source,
    heading: "Nouveau prospect qualifié depuis la landing page DTSC",
    message: [
      "Un prospect a été qualifié par l'assistant IA public DTSC.",
      "",
      "Profil du prospect",
      ...rows.slice(0, 6).map(([label, value]) => `- ${label}: ${value}`),
      "",
      "Besoin exprimé",
      ...rows.slice(6, 12).map(([label, value]) => `- ${label}: ${value}`),
      "",
      "Résumé IA",
      data.summary || "Non renseigné",
      "",
      `ID prospect : ${lead.id}`,
      "",
      "Action recommandée : recontacter le prospect, vérifier le consentement commercial et qualifier la suite dans Administration > Utilisateurs > Inscrits newsletter.",
    ].join("\n"),
    htmlMessage: [
      "<p>Un prospect a été qualifié par l'assistant IA public DTSC. Les informations ci-dessous sont prêtes pour qualification commerciale.</p>",
      "<table style=\"width:100%;border-collapse:collapse;\">",
      ...rows.map(([label, value]) => `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700;">${escapeHtml(label)}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(value)}</td></tr>`),
      "</table>",
      `<p><strong>ID prospect :</strong> ${escapeHtml(lead.id)}</p>`,
      "<p><strong>Action recommandée :</strong> recontacter le prospect, vérifier le consentement commercial et qualifier la suite dans Administration &gt; Utilisateurs &gt; Inscrits newsletter.</p>",
    ].join(""),
  }).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "Lead notification failed" }));

  return {
    ok: true,
    leadId: lead.id,
    mail,
    message: "Merci. Votre demande a bien été transmise à l'équipe DTSC. Un membre de notre équipe vous contactera prochainement.",
  };
}
