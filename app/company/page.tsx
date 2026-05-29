import { BriefcaseBusiness, FileText } from "lucide-react";
import { SubscriptionStatus } from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import { CompanyManager } from "@/components/company/company-manager";
import { DocumentManager } from "@/components/documents/document-manager";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
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

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <section className="dtsc-panel p-6">
          <p className="text-sm font-bold text-cyan-600">Entreprise</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-dtsc-ink">Contexte professionnel et documents métier</h1>
          <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
            Renseignez votre organisation, votre poste, vos activités clés et vos documents pour aider le chatbot DTSC à produire des réponses plus adaptées à votre réalité professionnelle.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <span title="Ces informations sont disponibles dans tous les plans et enrichissent le contexte privé du chatbot." className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-300">
              <BriefcaseBusiness className="h-4 w-4" />
              Contexte entreprise inclus dans tous les plans
            </span>
            <span title="La limite documentaire dépend toujours de votre abonnement actif." className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-300">
              <FileText className="h-4 w-4" />
              Capacité documentaire: {activeSubscription?.plan.maxDocuments ?? 0} document(s)
            </span>
          </div>
        </section>

        <Accordion>
          <AccordionItem title="Profil et activités entreprise" defaultOpen>
            <CompanyManager
              initialProfile={profile ? JSON.parse(JSON.stringify(profile)) : null}
              initialActivities={JSON.parse(JSON.stringify(activities))}
            />
          </AccordionItem>
          <AccordionItem title="Base documentaire du chatbot">
            <section className="space-y-4">
              <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5">
                <p className="text-sm font-black uppercase tracking-[0.16em] text-cyan-600">Documents</p>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">
                  Ajoutez les fichiers métier autorisés par votre abonnement. Ils restent dans votre périmètre privé et complètent le contexte entreprise renseigné ci-dessus.
                </p>
              </div>
              <DocumentManager
                maxDocuments={activeSubscription?.plan.maxDocuments ?? 0}
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
            </section>
          </AccordionItem>
        </Accordion>
      </div>
    </AppShell>
  );
}
