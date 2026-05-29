import { prisma } from "@/lib/prisma";

function line(label: string, value?: string | null) {
  return value?.trim() ? `- ${label}: ${value.trim()}` : null;
}

export async function getCompanyContextForUser(userId: string, organizationId: string | null = null) {
  const [profile, activities] = await Promise.all([
    prisma.companyProfile.findFirst({ where: { userId, organizationId } }),
    prisma.companyActivity.findMany({
      where: { userId, organizationId },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 12,
    }),
  ]);

  if (!profile && !activities.length) {
    return "";
  }

  const profileLines = profile
    ? [
        "Profil entreprise renseigné par l'utilisateur:",
        line("Organisation", profile.organizationName),
        line("Forme juridique", profile.legalForm),
        line("Secteur", profile.sector),
        line("Taille", profile.sizeRange),
        line("Localisation", [profile.city, profile.country].filter(Boolean).join(", ")),
        line("Site web", profile.website),
        line("Description", profile.description),
        line("Mission", profile.mission),
        line("Produits et services", profile.productsServices),
        line("Clients", profile.customers),
        line("Marchés", profile.markets),
        line("Concurrents", profile.competitors),
        line("Processus clés", profile.processes),
        line("Outils", profile.tools),
        line("Systèmes de données", profile.dataSystems),
        line("Conformité", profile.compliance),
        line("Défis", profile.challenges),
        line("Objectifs", profile.goals),
        line("KPI", profile.kpis),
        line("Poste utilisateur", profile.userPosition),
        line("Département", profile.department),
        line("Responsabilités", profile.responsibilities),
        line("Rôle décisionnel", profile.decisionRole),
      ].filter(Boolean)
    : [];

  const activityLines = activities.length
    ? [
        "Activités métier déclarées:",
        ...activities.map((activity, index) =>
          [
            `${index + 1}. ${activity.title} (${activity.priority})`,
            line("Description", activity.description),
            line("Fréquence", activity.frequency),
            line("Outils", activity.tools),
            line("Entrées de données", activity.dataInputs),
            line("Sorties de données", activity.dataOutputs),
            line("Points de friction", activity.painPoints),
          ]
            .filter(Boolean)
            .join("\n")
        ),
      ]
    : [];

  return [...profileLines, "", ...activityLines].filter(Boolean).join("\n");
}
