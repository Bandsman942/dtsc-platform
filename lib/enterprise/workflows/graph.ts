import type { WorkflowTransitionInput, WorkflowVersionInput } from "@/lib/enterprise/workflows/validators";

export type WorkflowReadinessBlocker = { code: string; message: string; stepCode?: string };
export type WorkflowReadiness = { ready: boolean; blockers: WorkflowReadinessBlocker[]; orderedStepCodes: string[] };

function add(blockers: WorkflowReadinessBlocker[], code: string, message: string, stepCode?: string) {
  blockers.push({ code, message, ...(stepCode ? { stepCode } : {}) });
}

export function validateWorkflowGraph(input: WorkflowVersionInput): WorkflowReadiness {
  const blockers: WorkflowReadinessBlocker[] = [];
  const steps = input.steps;
  const transitions = input.transitions;
  const stepByCode = new Map(steps.map((step) => [step.code, step]));

  if (stepByCode.size !== steps.length) add(blockers, "DUPLICATE_STEP_CODE", "Chaque étape doit posséder un code unique.");
  const startSteps = steps.filter((step) => step.stepType === "START");
  const endSteps = steps.filter((step) => step.stepType === "END");
  if (startSteps.length === 0) add(blockers, "MISSING_START", "Ajoutez une étape de départ.");
  if (startSteps.length > 1) add(blockers, "MULTIPLE_START", "Une version publiée doit posséder exactement une étape de départ.");
  if (endSteps.length === 0) add(blockers, "MISSING_END", "Ajoutez au moins une étape de fin.");

  const outgoing = new Map<string, WorkflowTransitionInput[]>();
  const incomingCount = new Map(steps.map((step) => [step.code, 0]));
  for (const transition of transitions) {
    if (!stepByCode.has(transition.fromStepCode)) add(blockers, "UNKNOWN_FROM_STEP", `L'étape source ${transition.fromStepCode} n'existe pas.`);
    if (!stepByCode.has(transition.toStepCode)) add(blockers, "UNKNOWN_TO_STEP", `L'étape cible ${transition.toStepCode} n'existe pas.`);
    if (transition.fromStepCode === transition.toStepCode) add(blockers, "SELF_CYCLE", "Une étape ne peut pas pointer vers elle-même.", transition.fromStepCode);
    const entries = outgoing.get(transition.fromStepCode) || [];
    entries.push(transition);
    outgoing.set(transition.fromStepCode, entries);
    incomingCount.set(transition.toStepCode, (incomingCount.get(transition.toStepCode) || 0) + 1);
  }

  for (const step of steps) {
    const routes = outgoing.get(step.code) || [];
    if (step.stepType === "END" && routes.length) add(blockers, "END_HAS_OUTGOING", "Une étape de fin ne peut pas avoir de transition sortante.", step.code);
    if (step.stepType !== "END" && routes.length === 0) add(blockers, "DEAD_END_STEP", "Cette étape n'a aucune suite configurée.", step.code);
    if (step.stepType !== "START" && (incomingCount.get(step.code) || 0) === 0) add(blockers, "ORPHAN_STEP", "Cette étape n'est reliée à aucune étape précédente.", step.code);

    const outcomeKeys = new Set<string>();
    for (const route of routes) {
      const key = `${route.outcome || "DEFAULT"}:${route.priority}`;
      if (outcomeKeys.has(key)) add(blockers, "AMBIGUOUS_BRANCH", "Deux transitions utilisent le même résultat et la même priorité.", step.code);
      outcomeKeys.add(key);
    }
    if (step.stepType === "CONDITION") {
      const outcomes = new Set(routes.map((route) => route.outcome));
      if (!outcomes.has("TRUE") || !outcomes.has("FALSE")) add(blockers, "CONDITION_BRANCHES_REQUIRED", "Une condition doit définir les branches Oui et Non.", step.code);
    }
    if (step.stepType === "CREATE_APPROVAL") {
      const outcomes = new Set(routes.map((route) => route.outcome));
      if (!outcomes.has("APPROVED") || !outcomes.has("REJECTED")) add(blockers, "APPROVAL_BRANCHES_REQUIRED", "Une validation doit définir les branches Approuvée et Rejetée.", step.code);
    }
  }

  const ordered: string[] = [];
  if (startSteps.length === 1) {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    let hasCycle = false;
    const visit = (code: string) => {
      if (visiting.has(code)) { hasCycle = true; return; }
      if (visited.has(code)) return;
      visiting.add(code);
      for (const route of outgoing.get(code) || []) if (stepByCode.has(route.toStepCode)) visit(route.toStepCode);
      visiting.delete(code);
      visited.add(code);
      ordered.unshift(code);
    };
    visit(startSteps[0].code);
    if (hasCycle) add(blockers, "CYCLE_NOT_ALLOWED", "Les boucles ne sont pas autorisées dans le moteur V1.");
    for (const step of steps) if (!visited.has(step.code)) add(blockers, "UNREACHABLE_STEP", "Cette étape n'est pas atteignable depuis le départ.", step.code);
    if (!endSteps.some((step) => visited.has(step.code))) add(blockers, "END_UNREACHABLE", "Aucune étape de fin n'est atteignable depuis le départ.");
  }

  return { ready: blockers.length === 0, blockers, orderedStepCodes: ordered };
}
