import type { OperationDataset, OperationField } from "@/lib/admin-operations-types";

const hrStatus = {
  employees: ["ACTIVE", "ONBOARDING", "ON_LEAVE", "SUSPENDED", "EXITED"],
  budgets: ["OPEN", "MONITORING", "OVER_BUDGET", "CLOSED"],
  expenses: ["SUBMITTED", "APPROVED", "REJECTED", "PAID", "ARCHIVED"],
  invoices: ["PENDING", "APPROVED", "PAID", "OVERDUE", "CANCELED"],
};

const scoStatus = {
  vendors: ["ACTIVE", "WATCHLIST", "SUSPENDED", "ARCHIVED"],
  purchaseRequests: ["DRAFT", "SUBMITTED", "APPROVED", "ORDERED", "RECEIVED", "REJECTED", "CANCELED"],
  inventory: ["AVAILABLE", "LOW_STOCK", "RESERVED", "OUT_OF_STOCK", "ARCHIVED"],
  assets: ["ASSIGNED", "AVAILABLE", "MAINTENANCE", "LOST", "RETIRED"],
  logistics: ["PLANNED", "READY", "IN_PROGRESS", "COMPLETED", "BLOCKED", "CANCELED"],
};

function statusOptions(values: string[]) {
  return values.map((value) => ({ value, label: label(value) }));
}

function label(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function selectField(name: string, fieldLabel: string, options: string[]): OperationField {
  return { name, label: fieldLabel, type: "select", options: statusOptions(options) };
}

function compactStrings(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value));
}

export function buildHrcfoDatasets(data: {
  employees: Array<Record<string, unknown>>;
  budgets: Array<Record<string, unknown>>;
  expenses: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
}): OperationDataset[] {
  return [
    {
      id: "employees",
      label: "Collaborateurs & dossiers RH",
      description: "Suivi des collaborateurs, postes, contrats, compétences, conformité documentaire et stabilité interne.",
      endpoint: "/api/admin/hr-cfo/employees",
      fields: [
        { name: "fullName", label: "Nom complet", type: "text", required: true },
        { name: "email", label: "Email", type: "email" },
        { name: "department", label: "Département", type: "text", required: true },
        { name: "jobTitle", label: "Poste", type: "text", required: true },
        selectField("contractType", "Contrat", ["PERMANENT", "CONSULTANT", "PART_TIME", "INTERN", "TEMPORARY"]),
        selectField("status", "Statut", hrStatus.employees),
        { name: "startDate", label: "Date d'entrée", type: "date" },
        { name: "monthlyCompensation", label: "Rémunération mensuelle", type: "number" },
        { name: "managerName", label: "Responsable", type: "text" },
        selectField("complianceStatus", "Conformité", ["COMPLETE", "TO_REVIEW", "MISSING_DOCUMENTS", "EXPIRED"]),
        { name: "skills", label: "Compétences", type: "textarea" },
        { name: "notes", label: "Notes RH", type: "textarea" },
      ],
      statusOptions: statusOptions(hrStatus.employees),
      records: data.employees.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.fullName),
        subtitle: `${stringOf(item.jobTitle)} · ${stringOf(item.department)}`,
        status: stringOf(item.status),
        amount: numberOf(item.monthlyCompensation),
        currency: "USD",
        notes: stringOrNull(item.notes),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([label(stringOf(item.contractType)), `Conformité: ${label(stringOf(item.complianceStatus))}`, stringOf(item.managerName)]),
      })),
    },
    {
      id: "budgets",
      label: "Budgets & contrôle",
      description: "Pilotage des enveloppes par département ou projet, consommation, risques et alertes de dépassement.",
      endpoint: "/api/admin/hr-cfo/budgets",
      fields: [
        { name: "name", label: "Budget", type: "text", required: true },
        { name: "ownerDepartment", label: "Département/projet", type: "text", required: true },
        { name: "periodStart", label: "Début période", type: "date" },
        { name: "periodEnd", label: "Fin période", type: "date" },
        { name: "amount", label: "Montant", type: "number", required: true },
        { name: "spentAmount", label: "Déjà consommé", type: "number" },
        selectField("status", "Statut", hrStatus.budgets),
        selectField("riskLevel", "Risque", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        { name: "notes", label: "Commentaires", type: "textarea" },
      ],
      statusOptions: statusOptions(hrStatus.budgets),
      records: data.budgets.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.name),
        subtitle: stringOf(item.ownerDepartment),
        status: stringOf(item.status),
        amount: numberOf(item.amount),
        currency: "USD",
        notes: stringOrNull(item.notes),
        createdAt: stringOf(item.createdAt),
        meta: [`Consommé: ${numberOf(item.spentAmount)?.toFixed(2) || "0.00"} USD`, `Risque: ${label(stringOf(item.riskLevel))}`],
      })),
    },
    {
      id: "expenses",
      label: "Dépenses & remboursements",
      description: "Demandes de dépenses, priorités, justificatifs, validation, paiement et historique de contrôle.",
      endpoint: "/api/admin/hr-cfo/expenses",
      fields: [
        { name: "title", label: "Dépense", type: "text", required: true },
        { name: "requesterName", label: "Demandeur", type: "text", required: true },
        { name: "category", label: "Catégorie", type: "text", required: true },
        { name: "amount", label: "Montant", type: "number", required: true },
        { name: "currency", label: "Devise", type: "text", placeholder: "USD" },
        { name: "project", label: "Projet lié", type: "text" },
        selectField("status", "Statut", hrStatus.expenses),
        selectField("priority", "Priorité", ["LOW", "MEDIUM", "HIGH", "URGENT"]),
        { name: "dueDate", label: "Échéance", type: "date" },
        { name: "evidenceUrl", label: "Lien justificatif", type: "text" },
        { name: "notes", label: "Notes", type: "textarea" },
      ],
      statusOptions: statusOptions(hrStatus.expenses),
      records: data.expenses.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${stringOf(item.requesterName)} · ${stringOf(item.category)}`,
        status: stringOf(item.status),
        amount: numberOf(item.amount),
        currency: stringOf(item.currency) || "USD",
        notes: stringOrNull(item.notes),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([label(stringOf(item.priority)), stringOf(item.project), formatDate(item.dueDate)]),
      })),
    },
    {
      id: "invoices",
      label: "Factures internes",
      description: "Suivi des factures fournisseurs et clients, échéances, paiements et rapprochement opérationnel.",
      endpoint: "/api/admin/hr-cfo/invoices",
      fields: [
        { name: "invoiceNumber", label: "N° facture", type: "text", required: true },
        { name: "counterparty", label: "Client/fournisseur", type: "text", required: true },
        selectField("invoiceType", "Type", ["PAYABLE", "RECEIVABLE"]),
        { name: "amount", label: "Montant", type: "number", required: true },
        { name: "currency", label: "Devise", type: "text", placeholder: "USD" },
        { name: "dueDate", label: "Échéance", type: "date" },
        selectField("status", "Statut", hrStatus.invoices),
        { name: "relatedProject", label: "Projet", type: "text" },
        { name: "notes", label: "Notes", type: "textarea" },
      ],
      statusOptions: statusOptions(hrStatus.invoices),
      records: data.invoices.map((item) => ({
        id: stringOf(item.id),
        title: `${stringOf(item.invoiceNumber)} · ${stringOf(item.counterparty)}`,
        subtitle: label(stringOf(item.invoiceType)),
        status: stringOf(item.status),
        amount: numberOf(item.amount),
        currency: stringOf(item.currency) || "USD",
        notes: stringOrNull(item.notes),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([stringOf(item.relatedProject), formatDate(item.dueDate)]),
      })),
    },
  ];
}

export function buildScoDatasets(data: {
  vendors: Array<Record<string, unknown>>;
  purchaseRequests: Array<Record<string, unknown>>;
  inventory: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  logistics: Array<Record<string, unknown>>;
}): OperationDataset[] {
  return [
    {
      id: "vendors",
      label: "Fournisseurs",
      description: "Répertoire fournisseurs, fiabilité, délais moyens, contacts et conditions de paiement.",
      endpoint: "/api/admin/sco/vendors",
      fields: [
        { name: "name", label: "Fournisseur", type: "text", required: true },
        { name: "category", label: "Catégorie", type: "text", required: true },
        { name: "contactName", label: "Contact", type: "text" },
        { name: "email", label: "Email", type: "email" },
        { name: "phone", label: "Téléphone", type: "text" },
        { name: "paymentTerms", label: "Conditions paiement", type: "text" },
        { name: "reliabilityScore", label: "Score fiabilité", type: "number" },
        { name: "avgLeadTimeDays", label: "Délai moyen jours", type: "number" },
        selectField("status", "Statut", scoStatus.vendors),
        { name: "notes", label: "Notes", type: "textarea" },
      ],
      statusOptions: statusOptions(scoStatus.vendors),
      records: data.vendors.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.name),
        subtitle: stringOf(item.category),
        status: stringOf(item.status),
        notes: stringOrNull(item.notes),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([`Score: ${stringOf(item.reliabilityScore)}/100`, `${stringOf(item.avgLeadTimeDays)} j`, stringOf(item.contactName)]),
      })),
    },
    {
      id: "purchaseRequests",
      label: "Demandes d'achat",
      description: "Besoins opérationnels, justification, budget, urgence, fournisseur pressenti et statut de commande.",
      endpoint: "/api/admin/sco/purchaseRequests",
      fields: [
        { name: "title", label: "Besoin", type: "text", required: true },
        { name: "requesterName", label: "Demandeur", type: "text", required: true },
        { name: "project", label: "Projet/mission", type: "text" },
        selectField("urgency", "Urgence", ["LOW", "MEDIUM", "HIGH", "URGENT"]),
        { name: "estimatedAmount", label: "Montant estimé", type: "number" },
        { name: "currency", label: "Devise", type: "text", placeholder: "USD" },
        selectField("status", "Statut", scoStatus.purchaseRequests),
        selectField("budgetStatus", "Budget", ["PENDING_REVIEW", "AVAILABLE", "INSUFFICIENT", "APPROVED"]),
        { name: "selectedVendorName", label: "Fournisseur retenu", type: "text" },
        { name: "neededBy", label: "Besoin avant", type: "date" },
        { name: "justification", label: "Justification", type: "textarea", required: true },
        { name: "notes", label: "Notes", type: "textarea" },
      ],
      statusOptions: statusOptions(scoStatus.purchaseRequests),
      records: data.purchaseRequests.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${stringOf(item.requesterName)} · ${stringOf(item.project)}`,
        status: stringOf(item.status),
        amount: numberOf(item.estimatedAmount),
        currency: stringOf(item.currency) || "USD",
        notes: stringOrNull(item.notes),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([label(stringOf(item.urgency)), `Budget: ${label(stringOf(item.budgetStatus))}`, stringOf(item.selectedVendorName), formatDate(item.neededBy)]),
      })),
    },
    {
      id: "inventory",
      label: "Stocks & inventaire",
      description: "Articles, quantités, seuils minimums, emplacements et inventaires périodiques.",
      endpoint: "/api/admin/sco/inventory",
      fields: [
        { name: "name", label: "Article", type: "text", required: true },
        { name: "sku", label: "Référence", type: "text" },
        { name: "category", label: "Catégorie", type: "text", required: true },
        { name: "quantity", label: "Quantité", type: "number" },
        { name: "minimumQuantity", label: "Seuil minimum", type: "number" },
        { name: "unit", label: "Unité", type: "text" },
        { name: "location", label: "Emplacement", type: "text" },
        { name: "ownerName", label: "Responsable", type: "text" },
        selectField("status", "Statut", scoStatus.inventory),
        { name: "lastInventoryAt", label: "Dernier inventaire", type: "date" },
        { name: "notes", label: "Notes", type: "textarea" },
      ],
      statusOptions: statusOptions(scoStatus.inventory),
      records: data.inventory.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.name),
        subtitle: `${stringOf(item.category)} · ${stringOf(item.location)}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.notes),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([`Qté: ${stringOf(item.quantity)} ${stringOf(item.unit)}`, `Seuil: ${stringOf(item.minimumQuantity)}`, stringOf(item.ownerName)]),
      })),
    },
    {
      id: "assets",
      label: "Actifs & équipements",
      description: "Matériel IT, imprimantes, supports terrain, assignations, état et maintenance.",
      endpoint: "/api/admin/sco/assets",
      fields: [
        { name: "tag", label: "Tag", type: "text", required: true },
        { name: "name", label: "Équipement", type: "text", required: true },
        { name: "category", label: "Catégorie", type: "text", required: true },
        { name: "assignedTo", label: "Assigné à", type: "text" },
        selectField("condition", "État", ["NEW", "GOOD", "FAIR", "DAMAGED", "REPAIR"]),
        selectField("status", "Statut", scoStatus.assets),
        { name: "purchaseDate", label: "Date achat", type: "date" },
        { name: "maintenanceDueAt", label: "Maintenance prévue", type: "date" },
        { name: "notes", label: "Notes", type: "textarea" },
      ],
      statusOptions: statusOptions(scoStatus.assets),
      records: data.assets.map((item) => ({
        id: stringOf(item.id),
        title: `${stringOf(item.tag)} · ${stringOf(item.name)}`,
        subtitle: stringOf(item.category),
        status: stringOf(item.status),
        notes: stringOrNull(item.notes),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([`État: ${label(stringOf(item.condition))}`, stringOf(item.assignedTo), formatDate(item.maintenanceDueAt)]),
      })),
    },
    {
      id: "logistics",
      label: "Missions & logistique",
      description: "Préparation des formations, événements, missions terrain, checklists et risques opérationnels.",
      endpoint: "/api/admin/sco/logistics",
      fields: [
        { name: "title", label: "Mission/événement", type: "text", required: true },
        { name: "location", label: "Lieu", type: "text", required: true },
        { name: "eventDate", label: "Date", type: "date" },
        { name: "ownerName", label: "Responsable", type: "text", required: true },
        selectField("status", "Statut", scoStatus.logistics),
        { name: "transportPlan", label: "Transport", type: "textarea" },
        { name: "equipmentChecklist", label: "Checklist matériel", type: "textarea" },
        { name: "riskNotes", label: "Risques", type: "textarea" },
        { name: "notes", label: "Notes", type: "textarea" },
      ],
      statusOptions: statusOptions(scoStatus.logistics),
      records: data.logistics.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${stringOf(item.location)} · ${stringOf(item.ownerName)}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.notes),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([formatDate(item.eventDate), stringOf(item.transportPlan) ? "Transport cadré" : "", stringOf(item.equipmentChecklist) ? "Checklist prête" : ""]),
      })),
    },
  ];
}

function stringOf(value: unknown) {
  return value == null ? "" : String(value);
}

function stringOrNull(value: unknown) {
  const text = stringOf(value);
  return text || null;
}

function numberOf(value: unknown) {
  if (value == null || value === "") {
    return null;
  }
  return Number(value);
}

function formatDate(value: unknown) {
  if (!value) {
    return "";
  }
  return new Date(String(value)).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
