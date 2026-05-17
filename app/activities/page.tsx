import { redirect } from "next/navigation";
import { ActivitiesDashboard } from "@/components/activities/activities-dashboard";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";
import { normalizePositionCode } from "@/lib/business-roles";
import { formatEnumLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

export default async function ActivitiesPage() {
  const user = await requireUser();
  const employee = await prisma.hrcfoEmployee.findFirst({
    where: { userId: user.id, status: { not: "EXITED" } },
    include: { position: true },
  });

  if (!employee) {
    redirect("/dashboard");
  }
  const positionCode = normalizePositionCode(employee.position?.code || employee.positionCode || employee.jobTitle);
  const isCeo = positionCode === "CEO";
  const isCoo = positionCode === "COO";
  const isSco = positionCode === "SCO";
  const isMpo = positionCode === "MPO";
  const isCto = positionCode === "CTO";
  const isLa = positionCode === "LA" || positionCode === "LEGAL_ADVISOR";
  const supervisesOperations = isCeo || isCoo;
  const supervisesSupplyChain = isCeo || isCoo || isSco;
  const supervisesProjects = isCeo || isCoo || isMpo;
  const supervisesTechnology = isCeo || isCoo || isCto;
  const supervisesLegal = isCeo || isLa;

  const [
    tasks,
    operations,
    requests,
    blockers,
    meetings,
    reports,
    workflowShares,
    payrolls,
    ceoObjectives,
    ceoSupervisionLogs,
    collaboratorRequests,
    scoPurchaseRequests,
    scoVendors,
    scoInventory,
    scoAssets,
    scoLogistics,
    mpoProjects,
    mpoRecords,
    ctoProjects,
    ctoRecords,
    legalCases,
    legalContracts,
    legalTemplates,
    legalRisks,
    legalDocuments,
    legalDisputes,
    legalRequests,
    legalReports,
    collaborators,
    operationOptions,
  ] = await Promise.all([
    prisma.cooTask.findMany({
      where: supervisesOperations ? {} : {
        OR: [
          { assigneeEmployeeId: employee.id },
          { responsibleEmployeeId: employee.id },
        ],
      },
      orderBy: [{ plannedDate: "desc" }, { updatedAt: "desc" }],
      take: 120,
    }),
    prisma.cooOperation.findMany({
      where: supervisesOperations ? {} : {
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
      where: supervisesOperations ? {} : {
        OR: [
          { requesterEmployeeId: employee.id },
          { targetResponsibleEmployeeId: employee.id },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.cooBlocker.findMany({
      where: supervisesOperations ? {} : { responsibleEmployeeId: employee.id },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.cooMeeting.findMany({
      where: supervisesOperations ? {} : {
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
      where: supervisesOperations ? {} : {
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
    prisma.ceoObjective.findMany({
      where: isCeo ? {} : { responsibleEmployeeId: employee.id },
      orderBy: [{ periodEnd: "desc" }, { updatedAt: "desc" }],
      take: 80,
    }),
    prisma.ceoSupervisionLog.findMany({
      where: isCeo ? {} : {
        OR: [
          { employeeId: employee.id },
          { followUpResponsibleId: employee.id },
        ],
      },
      orderBy: [{ logDate: "desc" }, { updatedAt: "desc" }],
      take: 80,
    }),
    prisma.collaboratorRequest.findMany({
      where: {
        OR: [
          { requesterEmployeeId: employee.id },
          { targetEmployeeId: employee.id },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 120,
    }),
    prisma.scoPurchaseRequest.findMany({
      where: supervisesSupplyChain ? {} : {
        OR: [
          { requesterName: employee.fullName },
          { sourceSection: positionCode },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.scoVendor.findMany({ orderBy: { updatedAt: "desc" }, take: supervisesSupplyChain ? 80 : 0 }),
    prisma.scoInventoryItem.findMany({
      where: supervisesSupplyChain ? {} : { ownerName: employee.fullName },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.scoAsset.findMany({
      where: supervisesSupplyChain ? {} : { assignedTo: employee.fullName },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.scoLogisticsEvent.findMany({
      where: supervisesSupplyChain ? {} : {
        OR: [
          { ownerName: employee.fullName },
          { requesterName: employee.fullName },
          { participants: { contains: employee.fullName, mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.mpoProject.findMany({
      where: supervisesProjects ? {} : {
        OR: [
          { responsibleMpoId: employee.id },
          { ctoEmployeeId: employee.id },
          { cooEmployeeId: employee.id },
          { hrCfoEmployeeId: employee.id },
          { scoEmployeeId: employee.id },
          { ceoEmployeeId: employee.id },
          { collaborators: { contains: employee.id } },
          { collaborators: { contains: employee.fullName, mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.mpoProjectRecord.findMany({
      where: supervisesProjects ? {} : {
        OR: [
          { responsibleEmployeeId: employee.id },
          { targetEmployeeId: employee.id },
          { project: { OR: [{ responsibleMpoId: employee.id }, { ctoEmployeeId: employee.id }, { cooEmployeeId: employee.id }, { hrCfoEmployeeId: employee.id }, { scoEmployeeId: employee.id }, { ceoEmployeeId: employee.id }] } },
        ],
      },
      include: { project: { select: { title: true } } },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.ctoTechnicalProject.findMany({
      where: supervisesTechnology ? {} : {
        OR: [
          { responsibleCtoId: employee.id },
          { technicalCollaborators: { contains: employee.id } },
          { technicalCollaborators: { contains: employee.fullName, mode: "insensitive" } },
          { mpoProject: { OR: [{ responsibleMpoId: employee.id }, { ctoEmployeeId: employee.id }, { scoEmployeeId: employee.id }, { ceoEmployeeId: employee.id }] } },
        ],
      },
      include: { mpoProject: { select: { title: true } } },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.ctoTechnicalRecord.findMany({
      where: supervisesTechnology ? {} : {
        OR: [
          { responsibleEmployeeId: employee.id },
          { assigneeEmployeeId: employee.id },
          { technicalProject: { OR: [{ responsibleCtoId: employee.id }, { technicalCollaborators: { contains: employee.id } }, { technicalCollaborators: { contains: employee.fullName, mode: "insensitive" } }] } },
        ],
      },
      include: { technicalProject: { select: { title: true } }, mpoProject: { select: { title: true } } },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.legalCase.findMany({
      where: supervisesLegal ? {} : { OR: [{ requesterEmployeeId: employee.id }, { responsibleLegalId: employee.id }, { createdById: user.id }] },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.legalContract.findMany({
      where: supervisesLegal ? {} : { OR: [{ internalResponsibleId: employee.id }, { createdById: user.id }] },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.legalTemplate.findMany({
      where: supervisesLegal ? {} : { authorId: employee.id },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.legalRisk.findMany({
      where: supervisesLegal ? {} : { OR: [{ responsibleEmployeeId: employee.id }, { createdById: user.id }] },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.legalDocument.findMany({
      where: supervisesLegal ? {} : { confidentialityLevel: "INTERNAL_PUBLIC", createdById: user.id },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.legalDispute.findMany({
      where: supervisesLegal ? {} : { OR: [{ followUpResponsibleId: employee.id }, { createdById: user.id }] },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.legalRequest.findMany({
      where: supervisesLegal ? {} : { OR: [{ requesterEmployeeId: employee.id }, { createdById: user.id }] },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.legalReport.findMany({
      where: supervisesLegal ? {} : { responsibleLegalId: employee.id },
      orderBy: { updatedAt: "desc" },
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
      id: "collaborator-forms",
      title: "Formulaires collaborateur",
      description: "Créez une réunion COO ou transmettez un dossier, contrat, risque, litige ou demande juridique au LA sans ouvrir les sections Administration sensibles.",
      items: [],
    },
    ...(isCeo ? [{
      id: "ceo",
      title: "Supervision CEO",
      description: "Vue des opérations critiques, blocages majeurs, rapports importants et décisions à suivre.",
      items: [
        ...blockers
          .filter((blocker) => blocker.severity === "CRITICAL" || blocker.status === "ESCALATED")
          .map((blocker) => ({
            id: blocker.id,
            entityType: "BLOCKER" as const,
            title: blocker.title,
            status: blocker.status,
            detail: [blocker.departmentName, `Criticité ${formatEnumLabel(blocker.severity)}`].filter(Boolean).join(" · "),
            body: blocker.impact || blocker.correctiveAction || blocker.description,
            date: toIso(blocker.declaredAt || blocker.updatedAt),
            priority: blocker.severity,
          })),
        ...operations
          .filter((operation) => operation.priority === "CRITICAL" || operation.status === "BLOCKED")
          .map((operation) => ({
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
        ...reports
          .filter((report) => report.priority === "CRITICAL" || report.priority === "HIGH")
          .map((report) => ({
            id: report.id,
            entityType: "REPORT" as const,
            title: report.title,
            status: report.status,
            detail: [formatEnumLabel(report.reportType), report.recipientName ? `À: ${report.recipientName}` : "", report.employeeName ? `De: ${report.employeeName}` : ""].filter(Boolean).join(" · "),
            body: report.content || report.recommendations || report.mainBlockers,
            date: toIso(report.updatedAt),
            priority: report.priority,
          })),
      ],
    }] : []),
    {
      id: "collab-requests",
      title: "Demandes collaboratives",
      description: "Formulez, recevez et suivez les demandes d'information, de validation, d'action ou de document entre collaborateurs DTSC.",
      items: collaboratorRequests.map((request) => ({
        id: request.id,
        entityType: "COLLAB_REQUEST" as const,
        title: request.title,
        status: request.status,
        detail: [
          formatEnumLabel(request.requestType),
          `De: ${request.requesterName}`,
          `À: ${request.targetName}`,
          request.dueDate ? formatDate(request.dueDate) : "",
        ].filter(Boolean).join(" · "),
        body: request.response ? `${request.message}\n\nRéponse: ${request.response}` : request.message,
        date: toIso(request.dueDate || request.updatedAt),
        priority: request.priority,
      })),
    },
    {
      id: "tasks",
      title: supervisesOperations ? "Tâches journalières" : "Mes tâches journalières",
      description: supervisesOperations
        ? "Supervisez les tâches opérationnelles, leur avancement, les retards et les points bloqués."
        : "Consultez vos tâches, changez leur statut, ajoutez des commentaires et signalez les blocages.",
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
      id: "ceo-follow-up",
      title: "Objectifs et supervision CEO",
      description: "Suivez les objectifs assignés par le CEO, les décisions de supervision et les échanges associés.",
      items: [
        ...ceoObjectives.map((objective) => ({
          id: objective.id,
          entityType: "CEO_OBJECTIVE" as const,
          title: objective.title,
          status: objective.status,
          detail: [
            formatEnumLabel(objective.objectiveType),
            objective.responsibleName ? `Responsable: ${objective.responsibleName}` : "",
            objective.periodEnd ? `Échéance: ${formatDate(objective.periodEnd)}` : "",
            `${objective.progress}%`,
          ].filter(Boolean).join(" · "),
          body: objective.comments || objective.description,
          date: toIso(objective.periodEnd || objective.updatedAt),
          priority: objective.priority,
          progress: objective.progress,
        })),
        ...ceoSupervisionLogs.map((log) => ({
          id: log.id,
          entityType: "CEO_SUPERVISION" as const,
          title: log.title,
          status: log.status,
          detail: [
            formatEnumLabel(log.entryType),
            log.employeeName ? `Collaborateur: ${log.employeeName}` : "",
            log.followUpResponsibleName ? `Suivi: ${log.followUpResponsibleName}` : "",
            formatDate(log.logDate),
          ].filter(Boolean).join(" · "),
          body: log.comments || log.expectedAction || log.description,
          date: toIso(log.logDate || log.updatedAt),
          priority: log.priority,
        })),
      ],
    },
    ...((isSco || isCeo || isCoo) ? [{
      id: "sco",
      title: "Activités SCO",
      description: "Suivez les achats, fournisseurs, stocks, actifs, équipements et missions logistiques qui vous concernent.",
      items: [
        ...scoPurchaseRequests.map((request) => ({
          id: request.id,
          entityType: "SCO_PURCHASE_REQUEST" as const,
          title: request.title,
          status: request.status,
          detail: [request.requesterName, request.requesterDepartmentName, request.sourceSection, request.neededBy ? formatDate(request.neededBy) : ""].filter(Boolean).join(" · "),
          body: request.notes || request.justification,
          date: toIso(request.neededBy || request.updatedAt),
          priority: request.urgency,
        })),
        ...scoVendors.map((vendor) => ({
          id: vendor.id,
          entityType: "SCO_VENDOR" as const,
          title: vendor.name,
          status: vendor.status,
          detail: [formatEnumLabel(vendor.vendorType || ""), vendor.category, `${vendor.avgLeadTimeDays} j`].filter(Boolean).join(" · "),
          body: vendor.notes || vendor.productsServices,
          date: toIso(vendor.updatedAt),
          priority: vendor.criticality,
        })),
        ...scoInventory.map((item) => ({
          id: item.id,
          entityType: "SCO_INVENTORY" as const,
          title: item.name,
          status: item.status,
          detail: [`${item.quantity} ${item.unit}`, item.location, item.ownerName].filter(Boolean).join(" · "),
          body: item.notes,
          date: toIso(item.updatedAt),
          priority: item.status === "OUT_OF_STOCK" ? "CRITICAL" : item.status === "LOW_STOCK" ? "HIGH" : "NORMAL",
        })),
        ...scoAssets.map((asset) => ({
          id: asset.id,
          entityType: "SCO_ASSET" as const,
          title: `${asset.tag} · ${asset.name}`,
          status: asset.status,
          detail: [asset.category, asset.assignedTo, asset.departmentName].filter(Boolean).join(" · "),
          body: asset.notes || asset.maintenanceHistory || asset.assignmentHistory,
          date: toIso(asset.updatedAt),
          priority: asset.status === "LOST" || asset.status === "DAMAGED" ? "CRITICAL" : "NORMAL",
        })),
        ...scoLogistics.map((mission) => ({
          id: mission.id,
          entityType: "SCO_LOGISTICS" as const,
          title: mission.title,
          status: mission.status,
          detail: [formatEnumLabel(mission.missionType || ""), mission.location, mission.eventDate ? formatDate(mission.eventDate) : "", mission.ownerName].filter(Boolean).join(" · "),
          body: mission.notes || mission.logisticsNeeds || mission.requiredMaterial,
          date: toIso(mission.eventDate || mission.updatedAt),
          priority: mission.status === "WAITING_MATERIAL" || mission.status === "WAITING_BUDGET" ? "HIGH" : "NORMAL",
        })),
      ],
    }] : []),
    ...((isMpo || isCeo || isCoo || isCto || isSco) ? [{
      id: "mpo-projects",
      title: "Projets MPO",
      description: "Consultez les projets, cahiers de charges, livrables, risques et demandes projet où vous êtes impliqué.",
      items: [
        ...mpoProjects.map((project) => ({
          id: project.id,
          entityType: "MPO_PROJECT" as const,
          title: project.title,
          status: project.status,
          detail: [formatEnumLabel(project.projectType), project.requester, project.dueDate ? formatDate(project.dueDate) : ""].filter(Boolean).join(" · "),
          body: project.comments || project.needDescription || project.expectedDeliverables,
          date: toIso(project.dueDate || project.updatedAt),
          priority: project.priority,
        })),
        ...mpoRecords.map((record) => ({
          id: record.id,
          entityType: "MPO_RECORD" as const,
          title: record.title,
          status: record.status,
          detail: [formatEnumLabel(record.recordType), record.project?.title, record.dueDate ? formatDate(record.dueDate) : ""].filter(Boolean).join(" · "),
          body: record.notes || record.description || record.content,
          date: toIso(record.dueDate || record.updatedAt),
          priority: record.priority,
          progress: record.progress,
        })),
      ],
    }] : []),
    ...((isCto || isCeo || isCoo || isMpo || isSco) ? [{
      id: "cto-tech",
      title: "Technologie CTO",
      description: "Suivez les projets techniques, tâches, bugs, incidents, déploiements, APIs, documentation et besoins matériels techniques.",
      items: [
        ...ctoProjects.map((project) => ({
          id: project.id,
          entityType: "CTO_PROJECT" as const,
          title: project.title,
          status: project.status,
          detail: [formatEnumLabel(project.solutionType), project.mpoProject?.title, project.environment, project.dueDate ? formatDate(project.dueDate) : ""].filter(Boolean).join(" · "),
          body: project.comments || project.technicalObjective || project.functionalSummary,
          date: toIso(project.dueDate || project.updatedAt),
          priority: project.priority,
        })),
        ...ctoRecords.map((record) => ({
          id: record.id,
          entityType: "CTO_RECORD" as const,
          title: record.title,
          status: record.status,
          detail: [formatEnumLabel(record.recordType), record.technicalProject?.title, record.environment, record.dueDate ? formatDate(record.dueDate) : ""].filter(Boolean).join(" · "),
          body: record.notes || record.description || record.content,
          date: toIso(record.dueDate || record.updatedAt),
          priority: record.priority,
          progress: record.progress,
        })),
      ],
    }] : []),
    ...((isLa || isCeo || legalCases.length || legalContracts.length || legalTemplates.length || legalRisks.length || legalDocuments.length || legalDisputes.length || legalRequests.length || legalReports.length) ? [{
      id: "la-legal",
      title: isLa ? "Mes activités juridiques LA" : "Suivi juridique",
      description: "Consultez les dossiers juridiques, contrats, risques, documents officiels, litiges, demandes et rapports qui vous concernent.",
      items: [
        ...legalCases.map((item) => ({
          id: item.id,
          entityType: "LEGAL_CASE" as const,
          title: item.title,
          status: item.status,
          detail: [formatEnumLabel(item.caseType), item.requesterDepartmentName, item.dueDate ? formatDate(item.dueDate) : ""].filter(Boolean).join(" · "),
          body: item.legalDecision || item.comments || item.description,
          date: toIso(item.dueDate || item.updatedAt),
          priority: item.priority,
        })),
        ...legalContracts.map((item) => ({
          id: item.id,
          entityType: "LEGAL_CONTRACT" as const,
          title: item.title,
          status: item.status,
          detail: [formatEnumLabel(item.contractType), item.counterparty, item.endDate ? formatDate(item.endDate) : ""].filter(Boolean).join(" · "),
          body: item.legalValidation || item.comments,
          date: toIso(item.endDate || item.updatedAt),
          href: item.documentUrl,
          hrefLabel: "Ouvrir le contrat",
        })),
        ...legalTemplates.map((item) => ({
          id: item.id,
          entityType: "LEGAL_TEMPLATE" as const,
          title: item.name,
          status: item.status,
          detail: [formatEnumLabel(item.templateType), item.version, item.authorName].filter(Boolean).join(" · "),
          body: item.comments || item.description || item.content,
          date: toIso(item.updatedAt),
        })),
        ...legalRisks.map((item) => ({
          id: item.id,
          entityType: "LEGAL_RISK" as const,
          title: item.title,
          status: item.status,
          detail: [item.departmentName, `Risque ${formatEnumLabel(item.riskLevel)}`, item.dueDate ? formatDate(item.dueDate) : ""].filter(Boolean).join(" · "),
          body: item.correctiveMeasure || item.potentialImpact || item.description,
          date: toIso(item.dueDate || item.updatedAt),
          priority: item.riskLevel,
        })),
        ...legalDocuments.map((item) => ({
          id: item.id,
          entityType: "LEGAL_DOCUMENT" as const,
          title: item.title,
          status: item.status,
          detail: [formatEnumLabel(item.documentType), formatEnumLabel(item.confidentialityLevel), item.expirationDate ? formatDate(item.expirationDate) : ""].filter(Boolean).join(" · "),
          body: item.comments,
          date: toIso(item.expirationDate || item.updatedAt),
          href: item.fileUrl,
          hrefLabel: "Ouvrir le document",
        })),
        ...legalDisputes.map((item) => ({
          id: item.id,
          entityType: "LEGAL_DISPUTE" as const,
          title: item.title,
          status: item.status,
          detail: [formatEnumLabel(item.disputeType), item.counterparty, item.dueDate ? formatDate(item.dueDate) : ""].filter(Boolean).join(" · "),
          body: item.nextAction || item.comments || item.description,
          date: toIso(item.dueDate || item.updatedAt),
          priority: item.riskLevel,
        })),
        ...legalRequests.map((item) => ({
          id: item.id,
          entityType: "LEGAL_REQUEST" as const,
          title: item.subject,
          status: item.status,
          detail: [formatEnumLabel(item.requestType), item.requesterDepartmentName, item.desiredDueDate ? formatDate(item.desiredDueDate) : ""].filter(Boolean).join(" · "),
          body: item.legalResponse || item.comments || item.description,
          date: toIso(item.desiredDueDate || item.updatedAt),
          priority: item.priority,
          href: item.documentUrl,
          hrefLabel: "Ouvrir le document",
        })),
        ...legalReports.map((item) => ({
          id: item.id,
          entityType: "LEGAL_REPORT" as const,
          title: item.title,
          status: item.status,
          detail: [formatEnumLabel(item.reportType), item.departmentName, item.periodEnd ? formatDate(item.periodEnd) : ""].filter(Boolean).join(" · "),
          body: item.recommendations || item.content,
          date: toIso(item.periodEnd || item.updatedAt),
          priority: item.priority,
          href: item.attachmentUrl,
          hrefLabel: "Ouvrir la pièce jointe",
        })),
      ],
    }] : []),
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
