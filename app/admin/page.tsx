import Link from "next/link";
import { BarChart3, Bot, FileText, Megaphone, MessageSquare, Settings, ShieldCheck, Users } from "lucide-react";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { AdminDataTables } from "@/components/admin/admin-data-tables";
import { AdminAuditTables } from "@/components/admin/admin-audit-tables";
import { AdminAccessPanel } from "@/components/admin/admin-access-panel";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { AdminSettingsPanel } from "@/components/admin/admin-settings-panel";
import { PublicPublicationsManager } from "@/components/admin/public-publications-manager";
import { SiteVisitsChart, type VisitPoint } from "@/components/admin/site-visits-chart";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireUser } from "@/lib/auth";
import { canAccessAdminBlock, canAccessAdministration, parseAdminRoleAccess, type AdminBlockId } from "@/lib/admin-access";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

function isUserRole(value: string | undefined): value is UserRole {
  return value === UserRole.ADMIN || value === UserRole.MANAGER || value === UserRole.CLIENT || value === UserRole.SUPPORT;
}

type AdminSectionId = AdminBlockId | "access";

const adminSections: Array<{ id: AdminSectionId; label: string; description: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "Vue générale", description: "KPIs et synthèse plateforme", icon: BarChart3 },
  { id: "access", label: "Accès RBAC", description: "Droits des rôles non-client", icon: ShieldCheck },
  { id: "settings", label: "Paramètres", description: "Limites, OTP, diffusions", icon: Settings },
  { id: "publications", label: "Publications", description: "Articles et ressources publiques", icon: FileText },
  { id: "users", label: "Utilisateurs", description: "Comptes, rôles et limites", icon: Users },
  { id: "visits", label: "Visites", description: "Audience du site public", icon: BarChart3 },
  { id: "activity", label: "Activité", description: "Conversations et tickets", icon: MessageSquare },
  { id: "audits", label: "Audits", description: "Paiements, API et webhooks", icon: Megaphone },
];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; period?: string; date?: string; section?: string }>;
}) {
  const user = await requireUser();
  if (!canAccessAdministration(user.role)) {
    redirect("/dashboard");
  }
  const { role, period, date, section } = await searchParams;
  const parsedPeriod = Number(period || 30);
  const selectedPeriod = Number.isFinite(parsedPeriod) ? Math.min(Math.max(parsedPeriod, 7), 200) : 30;
  const selectedDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  const visitStart = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date();
  const visitEnd = selectedDate ? new Date(`${selectedDate}T23:59:59`) : new Date();
  if (!selectedDate) {
    visitStart.setDate(visitStart.getDate() - Math.min(Math.max(selectedPeriod, 7), 200));
  }
  const roleFilter = isUserRole(role) ? role : undefined;

  const [settings, users, userCount, conversationCount, conversations, messageCount, usageLogs, tickets, visitRows, visitTotal, payments, apiLogs, webhookEvents, publicPublications] =
    await Promise.all([
      getAppSettings(),
      prisma.user.findMany({
        where: roleFilter ? { role: roleFilter } : undefined,
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { conversations: true } } },
        take: 200,
      }),
      prisma.user.count(),
      prisma.conversation.count(),
      prisma.conversation.findMany({
        orderBy: { updatedAt: "desc" },
        include: { user: true, _count: { select: { messages: true } } },
        take: 200,
      }),
      prisma.message.count(),
      prisma.usageLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.supportTicket.findMany({
        orderBy: { createdAt: "desc" },
        include: { user: true },
        take: 200,
      }),
      prisma.$queryRaw<Array<{ date: Date | string; count: number | bigint }>>`
        SELECT DATE("createdAt") AS date, COUNT(*)::int AS count
        FROM "SiteVisit"
        WHERE "createdAt" >= ${visitStart} AND "createdAt" <= ${visitEnd}
        GROUP BY DATE("createdAt")
        ORDER BY DATE("createdAt") ASC
      `,
      prisma.siteVisit.count({ where: { createdAt: { gte: visitStart, lte: visitEnd } } }),
      prisma.payment.findMany({
        orderBy: { createdAt: "desc" },
        include: { user: true, subscription: { include: { plan: true } } },
        take: 200,
      }),
      prisma.apiLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.webhookEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.publicPublication.findMany({
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
    ]);

  const totalTokens = usageLogs.reduce((sum, log) => sum + log.totalTokens, 0);
  const adminRoleAccess = parseAdminRoleAccess(settings.adminRoleAccess);
  const canView = (blockId: AdminBlockId) => canAccessAdminBlock(user.role, blockId, adminRoleAccess);
  const canViewSection = (sectionId: AdminSectionId) => sectionId === "access" ? user.role === UserRole.ADMIN : canView(sectionId);
  const visibleSections = adminSections.filter((item) => canViewSection(item.id));
  const activeSection = visibleSections.some((item) => item.id === section)
    ? (section as AdminSectionId)
    : visibleSections[0]?.id || "overview";
  const sectionHref = (sectionId: AdminSectionId) => {
    const params = new URLSearchParams();
    params.set("section", sectionId);
    if (roleFilter) {
      params.set("role", roleFilter);
    }
    if (selectedDate) {
      params.set("date", selectedDate);
    } else {
      params.set("period", String(selectedPeriod));
    }
    return `/admin?${params.toString()}`;
  };
  const chartLength = selectedDate ? 1 : Math.min(selectedPeriod, 60);
  const visitCountsByDate = new Map(
    visitRows.map((row) => {
      const key = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10);
      return [key, Number(row.count)];
    })
  );
  const visitPoints: VisitPoint[] = Array.from({ length: chartLength }).map((_, index) => {
    const day = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date();
    if (!selectedDate) {
      day.setDate(day.getDate() - (chartLength - 1 - index));
    }
    const dateKey = day.toISOString().slice(0, 10);
    const count = visitCountsByDate.get(dateKey) || 0;
    return {
      date: dateKey,
      label: day.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      count,
    };
  });
  const paymentAuditItems = payments.map((payment) => ({
    id: payment.id,
    reference: payment.reference,
    userEmail: payment.user.email,
    status: payment.status,
    amount: Number(payment.amount),
    currency: payment.currency,
    planName: payment.subscription?.plan.name || null,
    createdAt: payment.createdAt.toISOString(),
  }));
  const logAuditItems = [
    ...apiLogs.map((event) => ({
      id: event.id,
      source: "API" as const,
      title: `${event.method} · ${event.path}`,
      detail: event.userId ? `Utilisateur: ${event.userId}` : "Requête système ou publique",
      status: `HTTP ${event.statusCode}`,
      createdAt: event.createdAt.toISOString(),
    })),
    ...webhookEvents.map((event) => ({
      id: event.id,
      source: "Webhook" as const,
      title: `${event.provider} · ${event.eventType}`,
      detail: event.lastError || "Événement reçu et journalisé",
      status: event.status,
      createdAt: event.createdAt.toISOString(),
    })),
  ].sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <section className="dtsc-panel p-6">
          <p className="text-sm font-bold text-cyan-600">Administration</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-dtsc-ink">Pilotage DTSC Platform</h1>
          <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
            Supervisez les utilisateurs, les rôles RBAC, les conversations, les tickets support et l&apos;usage IA.
          </p>
        </section>

        <nav className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sous-modules Administration">
          {visibleSections.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <Link
                key={item.id}
                href={sectionHref(item.id)}
                className={`rounded-2xl border p-4 shadow-[0_12px_34px_rgba(0,43,91,0.07)] transition ${
                  active
                    ? "border-cyan-300 bg-[#002b5b] text-white"
                    : "border-dtsc-border bg-dtsc-surface text-dtsc-ink hover:border-cyan-300 hover:bg-dtsc-soft"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? "bg-white/10 text-cyan-200" : "bg-dtsc-soft text-dtsc-blue"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block font-black">{item.label}</span>
                    <span className={`mt-1 block text-xs leading-5 ${active ? "text-slate-200" : "text-dtsc-muted"}`}>{item.description}</span>
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        {activeSection === "overview" && canView("overview") && (
          <section className="grid gap-4 md:grid-cols-4">
            <StatCard label="Utilisateurs" value={userCount} helper="Comptes suivis" icon={Users} />
            <StatCard label="Conversations" value={conversationCount} helper="Total plateforme" icon={Bot} />
            <StatCard label="Messages" value={messageCount} helper="Total messages" icon={MessageSquare} />
            <StatCard label="Tokens" value={totalTokens} helper="Usage estimé" icon={BarChart3} />
          </section>
        )}

        {activeSection === "access" && user.role === UserRole.ADMIN && (
          <AdminAccessPanel access={adminRoleAccess} />
        )}

        {activeSection === "settings" && canView("settings") && (
          <AdminSettingsPanel
            canEdit={user.role === UserRole.ADMIN}
            settings={{
              defaultDailyMessageLimit: settings.defaultDailyMessageLimit,
              defaultDailyTokenLimit: settings.defaultDailyTokenLimit,
              chatbotEnabled: settings.chatbotEnabled,
              maintenanceMode: settings.maintenanceMode,
              supportAutoCloseDays: settings.supportAutoCloseDays,
              allowClientAnnouncements: settings.allowClientAnnouncements,
              commentEditWindowMinutes: settings.commentEditWindowMinutes,
              notificationRetentionDays: settings.notificationRetentionDays,
              signUpOtpEnabled: settings.signUpOtpEnabled,
              signUpOtpExpirationMinutes: settings.signUpOtpExpirationMinutes,
            }}
          />
        )}

        {activeSection === "publications" && canView("publications") && (
          <PublicPublicationsManager publications={JSON.parse(JSON.stringify(publicPublications))} canEdit={user.role === UserRole.ADMIN} />
        )}

        {activeSection === "users" && canView("users") && (
          <section className="dtsc-card p-6">
            <div className="mb-5">
              <h2 className="font-black text-dtsc-ink">Créer un compte utilisateur</h2>
              <p className="text-sm text-dtsc-muted">L&apos;admin peut créer un compte avec n&apos;importe quel rôle et définir les limites journalières.</p>
            </div>
            {user.role === UserRole.ADMIN ? <CreateUserForm /> : <p className="text-sm text-dtsc-muted">Bloc visible en lecture, modification réservée au rôle ADMIN.</p>}
          </section>
        )}

        {activeSection === "visits" && canView("visits") && <SiteVisitsChart points={visitPoints} selectedPeriod={selectedPeriod} selectedDate={selectedDate} totalVisits={visitTotal} />}

        {activeSection === "users" && canView("users") && (
          <AdminDataTables
            users={JSON.parse(JSON.stringify(users))}
            conversations={JSON.parse(JSON.stringify(conversations))}
            tickets={JSON.parse(JSON.stringify(tickets))}
            showUsers={true}
            showActivity={false}
            canManageUsers={user.role === UserRole.ADMIN}
          />
        )}

        {activeSection === "activity" && canView("activity") && (
          <AdminDataTables
            users={JSON.parse(JSON.stringify(users))}
            conversations={JSON.parse(JSON.stringify(conversations))}
            tickets={JSON.parse(JSON.stringify(tickets))}
            showUsers={false}
            showActivity={true}
            canManageUsers={false}
          />
        )}

        {activeSection === "audits" && canView("audits") && <AdminAuditTables payments={paymentAuditItems} logs={logAuditItems} />}

        {activeSection === "overview" && (
          <section className="rounded-2xl border border-dtsc-border bg-[#001736] p-6 text-white">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-cyan-300" />
            <div>
              <h2 className="font-black">Politique RBAC active</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                ADMIN supervise la plateforme, MANAGER prépare la supervision métier, SUPPORT traite les tickets et CLIENT utilise le chatbot et son espace privé.
              </p>
            </div>
          </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
