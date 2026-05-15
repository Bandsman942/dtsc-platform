import { redirect } from "next/navigation";
import { ActivitiesDashboard } from "@/components/activities/activities-dashboard";
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

  const [
    tasks,
    operations,
    requests,
    blockers,
    meetings,
    reports,
    workflowShares,
    payrolls,
    collaborators,
    operationOptions,
  ] = await Promise.all([
    prisma.cooTask.findMany({
      where: {
        OR: [
          { assigneeEmployeeId: employee.id },
          { responsibleEmployeeId: employee.id },
        ],
      },
      orderBy: [{ plannedDate: "desc" }, { updatedAt: "desc" }],
      take: 120,
    }),
    prisma.cooOperation.findMany({
      where: {
        OR: [
          { leadEmployeeId: employee.id },
          { collaborators: { contains: employee.id } },
          { collaborators: { contains: employee.fullName, mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.cooDepartmentRequest.findMany({
      where: {
        OR: [
          { requesterEmployeeId: employee.id },
          { targetResponsibleEmployeeId: employee.id },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.cooBlocker.findMany({
      where: { responsibleEmployeeId: employee.id },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.cooMeeting.findMany({
      where: {
        OR: [
          { reportOwnerEmployeeId: employee.id },
          { participants: { contains: employee.id } },
          { participants: { contains: employee.fullName, mode: "insensitive" } },
        ],
      },
      orderBy: [{ meetingDate: "desc" }, { updatedAt: "desc" }],
      take: 80,
    }),
    prisma.cooOperationalReport.findMany({
      where: {
        OR: [
          { employeeId: employee.id },
          { recipientEmployeeId: employee.id },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.cooWorkflowShare.findMany({
      where: { employeeId: employee.id },
      include: { workflow: true },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    prisma.hrcfoPayroll.findMany({
      where: { employeeId: employee.id },
      include: { budget: true, account: true },
      orderBy: [{ periodStart: "desc" }, { updatedAt: "desc" }],
      take: 80,
    }),
    prisma.hrcfoEmployee.findMany({
      where: { status: { not: "EXITED" } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, email: true },
    }),
    prisma.cooOperation.findMany({
      orderBy: { title: "asc" },
      select: { id: true, title: true },
      take: 200,
    }),
  ]);

  const openTasks = tasks.filter((task) => task.status !== "VALIDATED" && task.status !== "CANCELED").length;
  const blocked = [...tasks.filter((task) => task.status === "BLOCKED"), ...blockers.filter((blocker) => blocker.status !== "RESOLVED")].length;
  const completed = tasks.filter((task) => task.status === "COMPLETED" || task.status === "VALIDATED").length;

  const sections = [
    {
      id: "tasks",
      title: "Mes tâches journalières",
      description: "Consultez vos tâches, changez leur statut, ajoutez des commentaires et signalez les blocages.",
      items: tasks.map((task) => ({
        id: task.id,
        entityType: "TASK" as const,
        title: task.title,
        status: task.status,
        detail: [task.departmentName, task.plannedDate ? formatDate(task.plannedDate) : "", task.deadlineTime, task.responsibleName ? `Responsable: ${task.responsibleName}` : ""].filter(Boolean).join(" · "),
        body: task.description || task.managerComment || task.assigneeComment,
        date: toIso(task.plannedDate || task.updatedAt),
        priority: task.priority,
        progress: task.progress,
      })),
    },
    {
      id: "operations",
      title: "Opérations internes",
      description: "Suivez les opérations où vous êtes impliqué, leurs objectifs, livrables, priorités et mises à jour COO.",
      items: operations.map((operation) => ({
        id: operation.id,
        entityType: "OPERATION" as const,
        title: operation.title,
        status: operation.status,
        detail: [operation.pilotDepartmentName, `${operation.progress}%`, operation.dueDate ? formatDate(operation.dueDate) : ""].filter(Boolean).join(" · "),
        body: operation.objectives || operation.deliverables || operation.description,
        date: toIso(operation.updatedAt),
        priority: operation.priority,
        progress: operation.progress,
      })),
    },
    {
      id: "requests",
      title: "Coordination inter-départements",
      description: "Retrouvez les demandes reçues ou envoyées entre départements et échangez avec les responsables concernés.",
      items: requests.map((request) => ({
        id: request.id,
        entityType: "DEPARTMENT_REQUEST" as const,
        title: request.subject,
        status: request.status,
        detail: [request.requesterDepartmentName, request.targetDepartmentName].filter(Boolean).join(" → "),
        body: request.expectedResponse || request.comment || request.description,
        date: toIso(request.requestedAt || request.updatedAt),
        priority: request.priority,
      })),
    },
    {
      id: "blockers",
      title: "Blocages et réunions",
      description: "Suivez les points bloqués, réunions, décisions, comptes rendus et échanges opérationnels.",
      items: [
        ...blockers.map((blocker) => ({
          id: blocker.id,
          entityType: "BLOCKER" as const,
          title: blocker.title,
          status: blocker.status,
          detail: [blocker.departmentName, `Criticité ${formatEnumLabel(blocker.severity)}`].filter(Boolean).join(" · "),
          body: blocker.correctiveAction || blocker.impact || blocker.description,
          date: toIso(blocker.declaredAt || blocker.updatedAt),
          priority: blocker.severity,
        })),
        ...meetings.map((meeting) => ({
          id: meeting.id,
          entityType: "MEETING" as const,
          title: meeting.title,
          status: meeting.status,
          detail: [formatEnumLabel(meeting.meetingType), meeting.meetingDate ? formatDate(meeting.meetingDate) : "", meeting.meetingTime].filter(Boolean).join(" · "),
          body: meeting.minutes || meeting.decisions || meeting.agenda,
          date: toIso(meeting.meetingDate || meeting.updatedAt),
        })),
      ],
    },
    {
      id: "reports",
      title: "Rapports opérationnels",
      description: "Rédigez des rapports, consultez ceux que vous avez reçus et commentez les suivis opérationnels.",
      items: reports.map((report) => ({
        id: report.id,
        entityType: "REPORT" as const,
        title: report.title,
        status: report.status,
        detail: [formatEnumLabel(report.reportType), report.recipientName ? `À: ${report.recipientName}` : "", report.employeeName ? `De: ${report.employeeName}` : ""].filter(Boolean).join(" · "),
        body: report.content || report.recommendations || report.mainBlockers,
        date: toIso(report.updatedAt),
        priority: report.priority,
      })),
    },
    {
      id: "payrolls",
      title: "Suivi de la paie",
      description: "Consultez vos rémunérations dans le temps, le net payé, le budget lié et vos bulletins de paie.",
      items: payrolls.map((payroll) => ({
        id: payroll.id,
        entityType: "PAYROLL" as const,
        title: `Paie ${formatDate(payroll.periodStart)} - ${formatDate(payroll.periodEnd)}`,
        status: payroll.status,
        detail: [`Net: ${Number(payroll.netAmount).toFixed(2)} USD`, payroll.budget?.name, payroll.account?.name].filter(Boolean).join(" · "),
        body: [
          `Brut: ${Number(payroll.grossAmount).toFixed(2)} USD`,
          `Primes: ${Number(payroll.bonusAmount).toFixed(2)} USD`,
          `Retenues: ${Number(payroll.deductionAmount).toFixed(2)} USD`,
          payroll.notes || "",
        ].filter(Boolean).join("\n"),
        href: `/api/admin/payrolls/${payroll.id}/pdf`,
        hrefLabel: "Télécharger le bulletin de paie",
        date: toIso(payroll.periodStart),
      })),
    },
    {
      id: "workflows",
      title: "Workflows partagés",
      description: "Ouvrez les procédures COO partagées avec vous et posez vos questions en commentaires.",
      items: workflowShares.map((share) => ({
        id: share.workflowId,
        entityType: "WORKFLOW" as const,
        title: share.workflow.name,
        status: share.workflow.status,
        detail: [share.workflow.departmentName, share.instruction].filter(Boolean).join(" · "),
        body: share.workflow.steps || share.workflow.description,
        date: toIso(share.createdAt),
      })),
    },
  ];

  return (
    <AppShell user={user}>
      <ActivitiesDashboard
        sections={sections}
        collaborators={collaborators.map((collaborator) => ({ id: collaborator.id, label: `${collaborator.fullName} · ${collaborator.email}` }))}
        operations={operationOptions.map((operation) => ({ id: operation.id, label: operation.title }))}
        metrics={{ openTasks, completed, blocked }}
      />
    </AppShell>
  );
}

function toIso(value: Date) {
  return value.toISOString();
}

function formatDate(value: Date) {
  return value.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
