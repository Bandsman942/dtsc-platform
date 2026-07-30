import { BriefcaseBusiness, FileText } from "lucide-react";
import { SubscriptionStatus } from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import { CompanyManager } from "@/components/company/company-manager";
import { DocumentManager } from "@/components/documents/document-manager";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { getSession, requireUser } from "@/lib/auth";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export default async function CompanyPage() {
  const user = await requireUser();
  const session = await getSession();
  const activeOrganizationId = getActiveOrganizationId(session);
  const [profile, activities, documents, activeSubscription] = await Promise.all([
    prisma.companyProfile.findFirst({ where: { userId: user.id, organizationId: activeOrganizationId } }),
    prisma.companyActivity.findMany({
      where: { userId: user.id, organizationId: activeOrganizationId },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.knowledgeDocument.findMany({
      where: { userId: user.id, organizationId: activeOrganizationId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { chunks: true } } },
      take: 100,
    }),
    prisma.subscription.findFirst({
      where: { userId: user.id, status: SubscriptionStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    }),
  ]);

  const readyDocuments = documents.filter((document) => document.status === "READY").length;
  const documentCapacity = activeSubscription?.plan.maxDocuments ?? 0;

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Entreprise"
          title="Contexte professionnel et documents métier"
          count={profile?.organizationName || "À compléter"}
          description="Renseignez votre organisation, votre poste, vos activités clés et vos documents pour aider le chatbot DTSC à produire des réponses adaptées à votre réalité professionnelle."
        />
        <ModuleMetrics label="Indicateurs du contexte entreprise">
          <ModuleMetric label="Profil" value={profile ? "Actif" : "Incomplet"} hint={<span className="inline-flex items-center gap-1"><BriefcaseBusiness className="h-3.5 w-3.5" />Contexte privé</span>} />
          <ModuleMetric label="Activités métier" value={activities.length} hint="Éléments contextualisés" />
          <ModuleMetric label="Documents prêts" value={`${readyDocuments}/${documents.length}`} hint={<span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" />Base documentaire</span>} />
          <ModuleMetric label="Capacité" value={documentCapacity} hint="Documents autorisés" />
        </ModuleMetrics>
        <ModuleContent>
          <ModuleSection title="Capacités disponibles" description="Le profil entreprise enrichit le chatbot dans tous les plans; la capacité documentaire dépend de l’abonnement actif.">
            <div className="flex min-w-0 flex-wrap gap-2">
              <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-600"><BriefcaseBusiness className="h-4 w-4 shrink-0" /><span className="break-words">Contexte entreprise inclus dans tous les plans</span></span>
              <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-600"><FileText className="h-4 w-4 shrink-0" /><span className="break-words">Capacité documentaire: {documentCapacity} document(s)</span></span>
            </div>
          </ModuleSection>
          <Accordion>
            <AccordionItem title="Profil et activités entreprise" defaultOpen>
              <CompanyManager
                initialProfile={profile ? JSON.parse(JSON.stringify(profile)) : null}
                initialActivities={JSON.parse(JSON.stringify(activities))}
              />
            </AccordionItem>
            <AccordionItem title="Base documentaire du chatbot">
              <DocumentManager
                maxDocuments={documentCapacity}
                initialDocuments={documents.map((document) => ({
                  id: document.id,
                  title: document.title,
                  fileName: document.fileName,
                  mimeType: document.mimeType,
                  sizeBytes: document.sizeBytes,
                  status: document.status,
                  errorMessage: document.errorMessage,
                  createdAt: document.createdAt.toISOString(),
                  _count: document._count,
                }))}
              />
            </AccordionItem>
          </Accordion>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
