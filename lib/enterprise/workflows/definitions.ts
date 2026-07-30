import { Prisma } from "@prisma/client";
import { getWorkflowEntityAdapter } from "@/lib/enterprise/workflows/adapters";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { validateWorkflowGraph, type WorkflowReadinessBlocker } from "@/lib/enterprise/workflows/graph";
import { getEnterpriseWorkflowTemplate } from "@/lib/enterprise/workflows/templates";
import { validateTemplatePlaceholders } from "@/lib/enterprise/workflows/template";
import {
  workflowDefinitionCreateSchema,
  workflowDefinitionUpdateSchema,
  workflowStepSchema,
  workflowTransitionSchema,
  workflowVersionSchema,
  type WorkflowStepInput,
  type WorkflowVersionInput,
} from "@/lib/enterprise/workflows/validators";
import { prisma } from "@/lib/prisma";

const SUPPORTED_ORGANIZATION_ROLES = new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER", "MEMBER"]);

export function normalizeWorkflowCode(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

export async function listWorkflowDefinitions(organizationId: string) {
  return prisma.enterpriseWorkflowDefinition.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      versions: { orderBy: { versionNumber: "desc" }, take: 5, select: { id: true, versionNumber: true, status: true, publishedAt: true, createdAt: true } },
      _count: { select: { runs: true } },
    },
  });
}

export async function getWorkflowDefinition(organizationId: string, definitionId: string) {
  const definition = await prisma.enterpriseWorkflowDefinition.findFirst({
    where: { id: definitionId, organizationId, archivedAt: null },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          steps: { orderBy: { position: "asc" } },
          transitions: { include: { fromStep: { select: { code: true } }, toStep: { select: { code: true } } }, orderBy: { priority: "asc" } },
        },
      },
    },
  });
  if (!definition) throw new EnterpriseWorkflowError("Workflow introuvable.", 404, "WORKFLOW_DEFINITION_NOT_FOUND", "BUSINESS");
  return definition;
}

export async function createWorkflowDefinition(organizationId: string, actorUserId: string, raw: unknown) {
  const input = workflowDefinitionCreateSchema.parse(raw);
  const baseCode = normalizeWorkflowCode(input.code || input.name);
  if (!baseCode) throw new EnterpriseWorkflowError("Le code du workflow est invalide.", 400, "WORKFLOW_CODE_INVALID", "CONFIGURATION");
  return prisma.$transaction(async (tx) => {
    const member = await tx.organizationMember.findFirst({ where: { organizationId, userId: actorUserId, status: "ACTIVE", removedAt: null }, select: { id: true } });
    if (!member) throw new EnterpriseWorkflowError("Vous n’êtes pas membre actif de cette entreprise.", 403, "WORKFLOW_MEMBERSHIP_REQUIRED", "SECURITY");
    let code = baseCode;
    for (let suffix = 2; await tx.enterpriseWorkflowDefinition.findUnique({ where: { organizationId_code: { organizationId, code } }, select: { id: true } }); suffix += 1) code = `${baseCode.slice(0, 74)}_${suffix}`;
    const definition = await tx.enterpriseWorkflowDefinition.create({
      data: {
        organizationId,
        code,
        name: input.name,
        description: input.description || null,
        status: "DRAFT",
        triggerType: input.triggerType,
        triggerEntityType: input.triggerEntityType || null,
        triggerEventType: input.triggerEventType || null,
        allowManualStart: input.allowManualStart,
        singleActiveRun: input.singleActiveRun,
        createdByUserId: actorUserId,
      },
    });
    const version = await tx.enterpriseWorkflowVersion.create({ data: { organizationId, definitionId: definition.id, versionNumber: 1, status: "DRAFT", createdByUserId: actorUserId } });
    return { ...definition, versions: [version] };
  });
}

export async function createWorkflowFromTemplate(organizationId: string, actorUserId: string, templateCode: string, locale = "fr") {
  const template = getEnterpriseWorkflowTemplate(templateCode);
  if (!template) throw new EnterpriseWorkflowError("Modèle de workflow introuvable.", 404, "WORKFLOW_TEMPLATE_NOT_FOUND", "CONFIGURATION");
  const definition = await createWorkflowDefinition(organizationId, actorUserId, {
    code: template.code,
    name: locale === "en" ? template.nameEn : template.nameFr,
    description: locale === "en" ? template.descriptionEn : template.descriptionFr,
    triggerType: "DOMAIN_EVENT",
    triggerEntityType: template.triggerEntityType,
    triggerEventType: template.triggerEventType,
    allowManualStart: true,
    singleActiveRun: true,
  });
  const version = definition.versions[0];
  await saveWorkflowVersion(organizationId, definition.id, version.id, actorUserId, template.version);
  return getWorkflowDefinition(organizationId, definition.id);
}

export async function updateWorkflowDefinition(organizationId: string, definitionId: string, actorUserId: string, raw: unknown) {
  const input = workflowDefinitionUpdateSchema.parse(raw);
  const updated = await prisma.enterpriseWorkflowDefinition.updateMany({
    where: { id: definitionId, organizationId, archivedAt: null },
    data: { ...input, updatedByUserId: actorUserId },
  });
  if (updated.count !== 1) throw new EnterpriseWorkflowError("Workflow introuvable.", 404, "WORKFLOW_DEFINITION_NOT_FOUND", "BUSINESS");
  return getWorkflowDefinition(organizationId, definitionId);
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function saveWorkflowVersion(organizationId: string, definitionId: string, versionId: string, actorUserId: string, raw: unknown) {
  const input = workflowVersionSchema.parse(raw);
  await prisma.$transaction(async (tx) => {
    const version = await tx.enterpriseWorkflowVersion.findFirst({ where: { id: versionId, organizationId, definitionId }, select: { id: true, status: true } });
    if (!version) throw new EnterpriseWorkflowError("Version de workflow introuvable.", 404, "WORKFLOW_VERSION_NOT_FOUND", "BUSINESS");
    if (version.status !== "DRAFT") throw new EnterpriseWorkflowError("Une version publiée ou retirée est immuable.", 409, "PUBLISHED_WORKFLOW_IMMUTABLE", "BUSINESS");
    await tx.enterpriseWorkflowTransition.deleteMany({ where: { organizationId, workflowVersionId: versionId } });
    await tx.enterpriseWorkflowStep.deleteMany({ where: { organizationId, workflowVersionId: versionId } });
    const createdSteps = await Promise.all(input.steps.map((step) => tx.enterpriseWorkflowStep.create({ data: { organizationId, workflowVersionId: versionId, code: step.code, name: step.name, description: step.description || null, stepType: step.stepType, position: step.position, configurationJson: json(step.configuration) } })));
    const stepIds = new Map(createdSteps.map((step) => [step.code, step.id]));
    for (const transition of input.transitions) {
      const fromStepId = stepIds.get(transition.fromStepCode); const toStepId = stepIds.get(transition.toStepCode);
      if (!fromStepId || !toStepId) throw new EnterpriseWorkflowError("Une transition référence une étape inexistante.", 400, "WORKFLOW_TRANSITION_STEP_NOT_FOUND", "CONFIGURATION");
      await tx.enterpriseWorkflowTransition.create({ data: { organizationId, workflowVersionId: versionId, fromStepId, toStepId, outcome: transition.outcome || null, priority: transition.priority, conditionJson: transition.condition ? json(transition.condition) : undefined } });
    }
    await tx.enterpriseWorkflowVersion.update({ where: { id: versionId }, data: { configurationJson: input.configuration ? json(input.configuration) : undefined } });
    await tx.enterpriseWorkflowDefinition.update({ where: { id: definitionId }, data: { updatedByUserId: actorUserId } });
  });
  return { versionId, readiness: await getWorkflowVersionReadiness(organizationId, definitionId, versionId) };
}

export async function duplicateWorkflowVersion(organizationId: string, definitionId: string, sourceVersionId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.enterpriseWorkflowVersion.findFirst({ where: { id: sourceVersionId, organizationId, definitionId }, include: { steps: true, transitions: true } });
    if (!source) throw new EnterpriseWorkflowError("Version source introuvable.", 404, "WORKFLOW_VERSION_NOT_FOUND", "BUSINESS");
    const last = await tx.enterpriseWorkflowVersion.aggregate({ where: { organizationId, definitionId }, _max: { versionNumber: true } });
    const next = await tx.enterpriseWorkflowVersion.create({ data: { organizationId, definitionId, versionNumber: (last._max.versionNumber || 0) + 1, status: "DRAFT", configurationJson: source.configurationJson || undefined, createdByUserId: actorUserId } });
    const stepMap = new Map<string, string>();
    for (const step of source.steps.sort((a, b) => a.position - b.position)) {
      const created = await tx.enterpriseWorkflowStep.create({ data: { organizationId, workflowVersionId: next.id, code: step.code, name: step.name, description: step.description, stepType: step.stepType, position: step.position, configurationJson: step.configurationJson as Prisma.InputJsonValue } });
      stepMap.set(step.id, created.id);
    }
    for (const transition of source.transitions) {
      const fromStepId = stepMap.get(transition.fromStepId); const toStepId = stepMap.get(transition.toStepId);
      if (!fromStepId || !toStepId) throw new EnterpriseWorkflowError("La version source contient une transition invalide.", 409, "WORKFLOW_SOURCE_VERSION_INVALID", "CONFIGURATION");
      await tx.enterpriseWorkflowTransition.create({ data: { organizationId, workflowVersionId: next.id, fromStepId, toStepId, outcome: transition.outcome, priority: transition.priority, conditionJson: transition.conditionJson as Prisma.InputJsonValue | undefined } });
    }
    return next;
  });
}

async function versionToInput(organizationId: string, definitionId: string, versionId: string): Promise<{ definition: NonNullable<Awaited<ReturnType<typeof prisma.enterpriseWorkflowDefinition.findFirst>>>; input: WorkflowVersionInput }> {
  const definition = await prisma.enterpriseWorkflowDefinition.findFirst({ where: { id: definitionId, organizationId, archivedAt: null } });
  if (!definition) throw new EnterpriseWorkflowError("Workflow introuvable.", 404, "WORKFLOW_DEFINITION_NOT_FOUND", "BUSINESS");
  const version = await prisma.enterpriseWorkflowVersion.findFirst({ where: { id: versionId, organizationId, definitionId }, include: { steps: { orderBy: { position: "asc" } }, transitions: { include: { fromStep: { select: { code: true } }, toStep: { select: { code: true } } } } } });
  if (!version) throw new EnterpriseWorkflowError("Version de workflow introuvable.", 404, "WORKFLOW_VERSION_NOT_FOUND", "BUSINESS");
  const steps = version.steps.map((step) => workflowStepSchema.parse({ code: step.code, name: step.name, description: step.description || undefined, stepType: step.stepType, position: step.position, configuration: step.configurationJson }));
  const transitions = version.transitions.map((transition) => workflowTransitionSchema.parse({ fromStepCode: transition.fromStep.code, toStepCode: transition.toStep.code, outcome: transition.outcome || undefined, priority: transition.priority, condition: transition.conditionJson || undefined }));
  return { definition, input: workflowVersionSchema.parse({ steps, transitions, configuration: version.configurationJson || undefined }) };
}

async function validateAssignmentsAndConfiguration(organizationId: string, definition: NonNullable<Awaited<ReturnType<typeof prisma.enterpriseWorkflowDefinition.findFirst>>>, steps: WorkflowStepInput[]) {
  const blockers: WorkflowReadinessBlocker[] = [];
  if (!definition.triggerEntityType) return [{ code: "MISSING_TRIGGER_ENTITY", message: "Sélectionnez un type d’objet source." }];
  const adapter = getWorkflowEntityAdapter(definition.triggerEntityType);
  if (definition.triggerEventType && !adapter.triggerEvents.has(definition.triggerEventType)) blockers.push({ code: "INVALID_TRIGGER_EVENT", message: "Cet événement n’est pas autorisé pour le type d’objet sélectionné." });

  const assignments: Array<{ stepCode: string; value: { strategy: string; userId?: string; role?: string; departmentId?: string } }> = [];
  for (const step of steps) {
    switch (step.stepType) {
      case "CONDITION":
        if (!adapter.conditionFields.has(step.configuration.condition.field)) blockers.push({ code: "INVALID_CONDITION_FIELD", message: "Ce champ ne peut pas être utilisé dans une condition.", stepCode: step.code });
        break;
      case "WAIT_UNTIL":
        if (step.configuration.mode === "ENTITY_DATE" && !adapter.conditionFields.has(step.configuration.field)) blockers.push({ code: "INVALID_WAIT_FIELD", message: "Ce champ de date n’est pas autorisé.", stepCode: step.code });
        break;
      case "DOMAIN_ACTION":
        if (!adapter.domainActions.has(step.configuration.action)) blockers.push({ code: "INVALID_DOMAIN_ACTION", message: "Cette action métier n’est pas autorisée par l’adapter.", stepCode: step.code });
        if (step.configuration.commentTemplate) validateTemplatePlaceholders(step.configuration.commentTemplate, adapter.placeholders);
        break;
      case "ASSIGN":
        assignments.push({ stepCode: step.code, value: step.configuration.assignment });
        break;
      case "CREATE_APPROVAL":
        if (definition.triggerEntityType === "EnterpriseReport") blockers.push({ code: "APPROVAL_TARGET_UNSUPPORTED", message: "Les rapports ne prennent pas en charge une étape de validation métier.", stepCode: step.code });
        assignments.push({ stepCode: step.code, value: step.configuration.assignment });
        if (step.configuration.titleTemplate) validateTemplatePlaceholders(step.configuration.titleTemplate, adapter.placeholders);
        break;
      case "CREATE_TASK":
        if (step.configuration.assignment) assignments.push({ stepCode: step.code, value: step.configuration.assignment });
        validateTemplatePlaceholders(step.configuration.titleTemplate, adapter.placeholders);
        if (step.configuration.descriptionTemplate) validateTemplatePlaceholders(step.configuration.descriptionTemplate, adapter.placeholders);
        break;
      case "NOTIFICATION":
        assignments.push({ stepCode: step.code, value: step.configuration.recipient });
        validateTemplatePlaceholders(step.configuration.titleTemplate, adapter.placeholders);
        validateTemplatePlaceholders(step.configuration.bodyTemplate, adapter.placeholders);
        break;
      default:
        break;
    }
  }
  for (const assignment of assignments) {
    if (assignment.value.strategy === "SPECIFIC_USER") {
      const member = assignment.value.userId ? await prisma.organizationMember.findFirst({ where: { organizationId, userId: assignment.value.userId, status: "ACTIVE", removedAt: null }, select: { id: true } }) : null;
      if (!member) blockers.push({ code: "INVALID_SPECIFIC_USER", message: "L’utilisateur assigné n’est pas un membre actif de cette entreprise.", stepCode: assignment.stepCode });
    }
    if (assignment.value.strategy === "SPECIFIC_ROLE" && (!assignment.value.role || !SUPPORTED_ORGANIZATION_ROLES.has(assignment.value.role))) blockers.push({ code: "INVALID_ORGANIZATION_ROLE", message: "Le rôle d’assignation n’est pas pris en charge.", stepCode: assignment.stepCode });
    if (assignment.value.strategy === "DEPARTMENT_MANAGER" && assignment.value.departmentId) {
      const department = await prisma.enterpriseDepartment.findFirst({ where: { id: assignment.value.departmentId, organizationId, isActive: true }, select: { responsibleUserId: true } });
      if (!department?.responsibleUserId) blockers.push({ code: "DEPARTMENT_MANAGER_MISSING", message: "Ce département ne possède pas de responsable actif.", stepCode: assignment.stepCode });
    }
  }
  return blockers;
}

export async function getWorkflowVersionReadiness(organizationId: string, definitionId: string, versionId: string) {
  try {
    const { definition, input } = await versionToInput(organizationId, definitionId, versionId);
    const graph = validateWorkflowGraph(input);
    const blockers = [...graph.blockers, ...(await validateAssignmentsAndConfiguration(organizationId, definition, input.steps))];
    return { ready: blockers.length === 0, blockers, orderedStepCodes: graph.orderedStepCodes };
  } catch (error) {
    if (error instanceof EnterpriseWorkflowError) return { ready: false, blockers: [{ code: error.code, message: error.message }], orderedStepCodes: [] };
    if (error instanceof Error) return { ready: false, blockers: [{ code: "INVALID_TYPED_CONFIGURATION", message: error.message }], orderedStepCodes: [] };
    return { ready: false, blockers: [{ code: "INVALID_CONFIGURATION", message: "La configuration est invalide." }], orderedStepCodes: [] };
  }
}

export async function publishWorkflowVersion(organizationId: string, definitionId: string, versionId: string, actorUserId: string) {
  const readiness = await getWorkflowVersionReadiness(organizationId, definitionId, versionId);
  if (!readiness.ready) throw new EnterpriseWorkflowError("Le workflow n’est pas prêt à être publié.", 409, "WORKFLOW_NOT_READY", "CONFIGURATION");
  return prisma.$transaction(async (tx) => {
    const version = await tx.enterpriseWorkflowVersion.findFirst({ where: { id: versionId, organizationId, definitionId } });
    if (!version) throw new EnterpriseWorkflowError("Version introuvable.", 404, "WORKFLOW_VERSION_NOT_FOUND", "BUSINESS");
    if (version.status !== "DRAFT") throw new EnterpriseWorkflowError("Seule une version brouillon peut être publiée.", 409, "WORKFLOW_VERSION_NOT_DRAFT", "BUSINESS");
    await tx.enterpriseWorkflowVersion.updateMany({ where: { organizationId, definitionId, status: "PUBLISHED" }, data: { status: "RETIRED" } });
    const published = await tx.enterpriseWorkflowVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedByUserId: actorUserId } });
    await tx.enterpriseWorkflowDefinition.update({ where: { id: definitionId }, data: { status: "ACTIVE", currentVersionId: versionId, updatedByUserId: actorUserId } });
    return published;
  });
}

export async function retireWorkflowVersion(organizationId: string, definitionId: string, versionId: string, actorUserId: string) {
  const updated = await prisma.enterpriseWorkflowVersion.updateMany({ where: { id: versionId, organizationId, definitionId, status: "PUBLISHED" }, data: { status: "RETIRED" } });
  if (updated.count !== 1) throw new EnterpriseWorkflowError("La version publiée est introuvable.", 404, "PUBLISHED_WORKFLOW_VERSION_NOT_FOUND", "BUSINESS");
  await prisma.enterpriseWorkflowDefinition.updateMany({ where: { id: definitionId, organizationId, currentVersionId: versionId }, data: { status: "RETIRED", currentVersionId: null, updatedByUserId: actorUserId } });
}

export async function archiveWorkflowDefinition(organizationId: string, definitionId: string, actorUserId: string) {
  const activeRuns = await prisma.enterpriseWorkflowRun.count({ where: { organizationId, workflowDefinitionId: definitionId, status: { in: ["QUEUED", "RUNNING", "WAITING_APPROVAL", "WAITING_TIME", "BLOCKED"] } } });
  if (activeRuns) throw new EnterpriseWorkflowError("Un workflow avec des exécutions actives ne peut pas être archivé.", 409, "WORKFLOW_ACTIVE_RUNS_EXIST", "BUSINESS");
  const updated = await prisma.enterpriseWorkflowDefinition.updateMany({ where: { id: definitionId, organizationId, archivedAt: null }, data: { status: "ARCHIVED", archivedAt: new Date(), updatedByUserId: actorUserId } });
  if (updated.count !== 1) throw new EnterpriseWorkflowError("Workflow introuvable.", 404, "WORKFLOW_DEFINITION_NOT_FOUND", "BUSINESS");
}
