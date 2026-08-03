import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { requireUser } from "@/lib/auth";
import { getStandardPersonalWorkspaceGuide, STANDARD_PERSONAL_WORKSPACE_GUIDES } from "@/lib/account/standard-guides";

export default async function StandardHelpPage({
  searchParams,
}: {
  searchParams?: Promise<{ guide?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const guide = getStandardPersonalWorkspaceGuide(params?.guide);

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Aide DTSC"
          title={guide?.title || "Guides de l’espace personnel"}
          count={guide ? "Guide fonctionnel" : `${Object.keys(STANDARD_PERSONAL_WORKSPACE_GUIDES).length} guides`}
          description={guide?.summary || "Ces guides décrivent uniquement les fonctions réellement disponibles dans l’espace personnel, le compte et les services SaaS associés."}
          secondaryActions={guide ? (
            <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              <Link href="/help/standard">Tous les guides</Link>
            </Button>
          ) : undefined}
        />
        <ModuleContent>
          {guide ? (
            <div className="min-w-0 space-y-5">
              {guide.sections.map((section, index) => (
                <ModuleSection key={section.title} title={`${index + 1}. ${section.title}`} description="Procédure utilisateur">
                  <ol className="space-y-3">
                    {section.steps.map((step, stepIndex) => (
                      <li key={step} className="flex min-w-0 items-start gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page/40 p-4 text-sm leading-7 text-dtsc-muted">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#001736] text-xs font-black text-white">{stepIndex + 1}</span>
                        <span className="min-w-0 break-words">{step}</span>
                      </li>
                    ))}
                  </ol>
                </ModuleSection>
              ))}
            </div>
          ) : (
            <ModuleSection title="Choisir un guide" description="Ouvrez le guide correspondant au module que vous utilisez.">
              <BusinessList ariaLabel="Guides de l’espace personnel">
                {Object.values(STANDARD_PERSONAL_WORKSPACE_GUIDES).map((item) => (
                  <BusinessListItem
                    key={item.slug}
                    leading={<BookOpen className="h-5 w-5 text-cyan-600" />}
                    title={item.title}
                    description={item.summary}
                    actions={<Link href={`/help/standard?guide=${item.slug}`} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-black text-dtsc-blue hover:bg-dtsc-soft">Ouvrir <ChevronRight className="h-4 w-4" /></Link>}
                  />
                ))}
              </BusinessList>
            </ModuleSection>
          )}
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
