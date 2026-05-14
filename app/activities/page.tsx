import { CircleAlert, ClipboardList, GitBranch, Users, type LucideIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";
import { formatEnumLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

export default async function ActivitiesPage() {
  const user = await requireUser();
  const employee = await prisma.hrcfoEmployee.findFirst({
    where: { userId: user.id, status: { not: "EXITED" } },
  });

  if (!employee) {
    redirect("/dashboard");
  }

  const [tasks, operations, requests, blockers, meetings] = await Promise.all([
    prisma.cooTask.findMany({
      where: {
        OR: [
          { assigneeEmployeeId: employee.id },
          { responsibleEmployeeId: employee.id },
        ],
      },
      orderBy: [{ plannedDate: "desc" }, { updatedAt: "desc" }],
      take: 80,
    }),
    prisma.cooOperation.findMany({
      where: {
        OR: [
          { leadEmployeeId: employee.id },
          { collaborators: { contains: employee.fullName, mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 40,
    }),
    prisma.cooDepartmentRequest.findMany({
      where: {
        OR: [
          { requesterEmployeeId: employee.id },
          { targetResponsibleEmployeeId: employee.id },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 40,
    }),
    prisma.cooBlocker.findMany({
      where: { responsibleEmployeeId: employee.id },
      orderBy: { updatedAt: "desc" },
      take: 40,
    }),
    prisma.cooMeeting.findMany({
      where: {
        OR: [
          { reportOwnerEmployeeId: employee.id },
          { participants: { contains: employee.fullName, mode: "insensitive" } },
        ],
      },
      orderBy: [{ meetingDate: "desc" }, { updatedAt: "desc" }],
      take: 40,
    }),
  ]);

  const openTasks = tasks.filter((task) => task.status !== "VALIDATED" && task.status !== "CANCELED").length;
  const blocked = [...tasks.filter((task) => task.status === "BLOCKED"), ...blockers.filter((blocker) => blocker.status !== "RESOLVED")].length;
  const completed = tasks.filter((task) => task.status === "COMPLETED" || task.status === "VALIDATED").length;

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <section className="dtsc-panel p-6">
          <p className="text-sm font-bold text-cyan-600">Espace collaborateur</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-dtsc-ink">Activités DTSC</h1>
          <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
            Retrouvez les tâches, opérations internes, demandes inter-départements, réunions et blocages qui vous sont partagés par l&apos;équipe COO.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Metric label="Tâches ouvertes" value={openTasks} />
            <Metric label="Terminées / validées" value={completed} />
            <Metric label="Points bloqués" value={blocked} />
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <ActivityCard icon={ClipboardList} title="Mes tâches journalières" items={tasks.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            detail: [task.departmentName, task.plannedDate ? task.plannedDate.toLocaleDateString("fr-FR") : "", task.deadlineTime].filter(Boolean).join(" · "),
            body: task.description,
          }))} />
          <ActivityCard icon={GitBranch} title="Opérations internes" items={operations.map((operation) => ({
            id: operation.id,
            title: operation.title,
            status: operation.status,
            detail: [operation.pilotDepartmentName, `${operation.progress}%`, operation.dueDate ? operation.dueDate.toLocaleDateString("fr-FR") : ""].filter(Boolean).join(" · "),
            body: operation.objectives || operation.description,
          }))} />
          <ActivityCard icon={Users} title="Coordination inter-départements" items={requests.map((request) => ({
            id: request.id,
            title: request.subject,
            status: request.status,
            detail: [request.requesterDepartmentName, request.targetDepartmentName].filter(Boolean).join(" → "),
            body: request.expectedResponse || request.description,
          }))} />
          <ActivityCard icon={CircleAlert} title="Blocages et réunions" items={[
            ...blockers.map((blocker) => ({
              id: blocker.id,
              title: blocker.title,
              status: blocker.status,
              detail: [blocker.departmentName, `Criticité ${formatEnumLabel(blocker.severity)}`].filter(Boolean).join(" · "),
              body: blocker.correctiveAction || blocker.description,
            })),
            ...meetings.map((meeting) => ({
              id: meeting.id,
              title: meeting.title,
              status: meeting.status,
              detail: [formatEnumLabel(meeting.meetingType), meeting.meetingDate ? meeting.meetingDate.toLocaleDateString("fr-FR") : "", meeting.meetingTime].filter(Boolean).join(" · "),
              body: meeting.agenda || meeting.minutes,
            })),
          ]} />
        </div>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-dtsc-muted">{label}</p>
      <p className="mt-2 text-3xl font-black text-dtsc-ink">{value}</p>
    </div>
  );
}

function ActivityCard({
  icon: Icon,
  title,
  items,
}: {
  icon: LucideIcon;
  title: string;
  items: Array<{ id: string; title: string; status: string; detail: string; body?: string | null }>;
}) {
  return (
    <section className="dtsc-card min-w-0 p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-500">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-black text-dtsc-ink">{title}</h2>
          <p className="text-sm text-dtsc-muted">{items.length} élément(s) lié(s) à votre dossier collaborateur.</p>
        </div>
      </div>
      <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-1">
        {items.map((item) => (
          <article key={item.id} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-black text-dtsc-ink">{item.title}</p>
                {item.detail && <p className="mt-1 text-sm text-dtsc-muted">{item.detail}</p>}
              </div>
              <span className="rounded-full bg-dtsc-soft px-3 py-1 text-xs font-black text-dtsc-blue">{formatEnumLabel(item.status)}</span>
            </div>
            {item.body && <p className="mt-3 line-clamp-3 text-sm leading-6 text-dtsc-muted">{item.body}</p>}
          </article>
        ))}
        {items.length === 0 && (
          <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">
            Aucun élément partagé pour le moment.
          </p>
        )}
      </div>
    </section>
  );
}
