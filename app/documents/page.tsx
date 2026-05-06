import { FileText } from "lucide-react";
import { SubscriptionStatus } from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentManager } from "@/components/documents/document-manager";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DocumentsPage() {
  const user = await requireUser();
  const [documents, activeSubscription] = await Promise.all([
    prisma.knowledgeDocument.findMany({
      where: { userId: user.id },
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
          <p className="text-sm font-bold text-cyan-600">Base documentaire</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-dtsc-ink">Documents pour le chatbot</h1>
          <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
            Indexez des contenus métier pour permettre au chatbot DTSC de répondre avec un contexte plus précis dans vos conversations.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-300">
            <FileText className="h-4 w-4" />
            Capacité documentaire: {activeSubscription?.plan.maxDocuments ?? 0} document(s)
          </div>
        </section>

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
      </div>
    </AppShell>
  );
}
