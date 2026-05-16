import { formatEnumLabel } from "@/lib/labels";
import type { OperationDataset, OperationField } from "@/lib/admin-operations-types";

const hrStatus = {
  employees: ["ACTIVE", "ONBOARDING", "ON_LEAVE", "SUSPENDED", "EXITED"],
  budgets: ["OPEN", "MONITORING", "OVER_BUDGET", "CLOSED"],
  transactions: ["DRAFT", "PENDING", "VALIDATED", "PAID", "REJECTED", "CANCELED"],
  payrolls: ["DRAFT", "VALIDATED", "PAID", "CANCELED"],
  references: ["ACTIVE", "INACTIVE"],
};

const ceoStatus = {
  objectives: ["PLANNED", "IN_PROGRESS", "ACHIEVED", "MISSED", "LATE", "CANCELED"],
  supervisionLogs: ["OPEN", "IN_PROGRESS", "DONE", "ARCHIVED", "CANCELED"],
};

const scoStatus = {
  vendors: ["ACTIVE", "WATCHLIST", "SUSPENDED", "ARCHIVED", "BLACKLISTED"],
  purchaseRequests: ["DRAFT", "SUBMITTED", "SCO_REVIEW", "WAITING_BUDGET", "WAITING_HR_CFO_VALIDATION", "WAITING_CEO_VALIDATION", "APPROVED", "ORDERED", "RECEIVED", "REJECTED", "CANCELED"],
  inventory: ["AVAILABLE", "LOW_STOCK", "RESERVED", "OUT_OF_STOCK", "ARCHIVED"],
  assets: ["ASSIGNED", "AVAILABLE", "MAINTENANCE", "DAMAGED", "LOST", "RETURNED", "RETIRED"],
  logistics: ["PLANNED", "PREPARING", "WAITING_MATERIAL", "WAITING_BUDGET", "READY", "IN_PROGRESS", "COMPLETED", "CANCELED"],
};

const cooStatus = {
  operations: ["DRAFT", "PLANNED", "IN_PROGRESS", "WAITING", "BLOCKED", "COMPLETED", "CANCELED"],
  tasks: ["TODO", "IN_PROGRESS", "PENDING_VALIDATION", "COMPLETED", "VALIDATED", "REJECTED", "LATE", "BLOCKED", "CANCELED"],
  recurringTasks: ["ACTIVE", "INACTIVE"],
  departmentRequests: ["NEW", "ACCEPTED", "IN_PROGRESS", "WAITING_INFORMATION", "DONE", "REJECTED", "BLOCKED", "CANCELED"],
  blockers: ["OPEN", "IN_PROGRESS", "RESOLVED", "UNRESOLVED", "ESCALATED", "CANCELED"],
  meetings: ["PLANNED", "HELD", "POSTPONED", "CANCELED"],
  workflows: ["DRAFT", "ACTIVE", "IN_PROGRESS", "COMPLETED", "BLOCKED", "ARCHIVED"],
  reports: ["DRAFT", "PUBLISHED", "ARCHIVED"],
};

const mpoStatus = {
  projects: ["DRAFT", "SCOPING", "INTERNAL_VALIDATION", "WAITING_CTO", "WAITING_BUDGET", "WAITING_SCO_RESOURCES", "DEVELOPMENT", "TESTING", "WAITING_CLIENT", "BLOCKED", "DELIVERED", "CLOSED", "CANCELED"],
  records: ["DRAFT", "IN_PROGRESS", "SUBMITTED", "WAITING", "VALIDATED", "DELIVERED", "BLOCKED", "ARCHIVED", "CANCELED"],
};

const ctoStatus = {
  projects: ["DRAFT", "TECH_ANALYSIS", "WAITING_MPO", "WAITING_BUDGET", "WAITING_MATERIAL", "DEVELOPMENT", "REVIEW", "TESTING", "PREPRODUCTION", "PRODUCTION", "BLOCKED", "DELIVERED", "CLOSED", "CANCELED"],
  records: ["DRAFT", "OPEN", "ANALYSIS", "IN_PROGRESS", "REVIEW", "TESTING", "RESOLVED", "VALIDATED", "BLOCKED", "ARCHIVED", "CANCELED"],
};

const laStatus = {
  cases: ["DRAFT", "SUBMITTED", "ANALYSIS", "DRAFTING", "LEGAL_REVIEW", "TO_CORRECT", "LEGAL_VALIDATED", "REJECTED", "WAITING_CEO", "SIGNED", "ARCHIVED", "CANCELED"],
  contracts: ["DRAFT", "DRAFTING", "LEGAL_REVIEW", "TO_CORRECT", "LEGAL_VALIDATED", "WAITING_SIGNATURE", "SIGNED", "EXPIRED", "TERMINATED", "ARCHIVED"],
  templates: ["DRAFT", "REVISION", "VALIDATED", "ARCHIVED"],
  risks: ["OPEN", "ANALYSIS", "PROCESSING", "ESCALATED", "RESOLVED", "ARCHIVED", "CANCELED"],
  documents: ["ACTIVE", "EXPIRED", "ARCHIVED", "CANCELED"],
  disputes: ["OPEN", "ANALYSIS", "DISCUSSION", "NEGOTIATION", "WAITING_DECISION", "RESOLVED", "CLOSED", "ARCHIVED"],
  requests: ["SUBMITTED", "ANALYSIS", "MISSING_INFORMATION", "PROCESSING", "DONE", "REJECTED", "ARCHIVED"],
  reports: ["DRAFT", "PUBLISHED", "ARCHIVED"],
};

function statusOptions(values: string[]) {
  return values.map((value) => ({ value, label: formatEnumLabel(value) }));
}

function selectField(name: string, fieldLabel: string, options: string[]): OperationField {
  return { name, label: fieldLabel, type: "select", options: statusOptions(options) };
}

function option(value: unknown, label: unknown, email?: unknown) {
  return { value: stringOf(value), label: stringOf(label), email: email ? stringOf(email) : undefined };
}

function compactStrings(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value));
}

type HrcfoData = {
  employees: Array<Record<string, unknown>>;
  budgets: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
  payrolls: Array<Record<string, unknown>>;
  departments: Array<Record<string, unknown>>;
  accounts: Array<Record<string, unknown>>;
  positions: Array<Record<string, unknown>>;
  staffUsers: Array<Record<string, unknown>>;
};

export function buildHrcfoDatasets(data: HrcfoData): OperationDataset[] {
  const activeDepartments = data.departments.filter((item) => stringOf(item.status) === "ACTIVE");
  const activeAccounts = data.accounts.filter((item) => stringOf(item.status) === "ACTIVE");
  const staffOptions = data.staffUsers.map((user) => option(user.id, `${stringOf(user.name)} · ${formatEnumLabel(stringOf(user.role))}`, user.email));
  const departmentOptions = activeDepartments.map((department) => option(department.id, stringOf(department.name)));
  const accountOptions = activeAccounts.map((account) => option(account.id, `${stringOf(account.name)} · ${formatEnumLabel(stringOf(account.accountType))}`));
  const positionOptions = data.positions
    .filter((position) => stringOf(position.status) === "ACTIVE")
    .map((position) => option(position.id, `${stringOf(position.title)} · ${stringOf(position.code)}`));
  const budgetOptions = data.budgets
    .filter((budget) => ["OPEN", "MONITORING"].includes(stringOf(budget.status)) && budgetRemaining(budget) > 0)
    .map((budget) => option(budget.id, `${stringOf(budget.name)} · solde ${budgetRemaining(budget).toFixed(2)} USD`));
  const employeeOptions = data.employees
    .filter((employee) => stringOf(employee.status) !== "EXITED")
    .map((employee) => option(employee.id, `${stringOf(employee.fullName)} · ${stringOf(employee.email)}`, `${(numberOf(employee.monthlyCompensation) || 0).toFixed(2)} USD`));
  const employeeUserOptions = data.employees
    .filter((employee) => stringOf(employee.status) !== "EXITED")
    .map((employee) => option(employee.userId, `${stringOf(employee.fullName)} · ${stringOf(employee.email)}`))
    .filter((employee) => employee.value);

  return [
    {
      id: "departments",
      label: "Manager les départements",
      description: "Référentiel officiel des départements DTSC utilisé par les collaborateurs, budgets et transactions.",
      endpoint: "/api/admin/hr-cfo/departments",
      fields: [
        { name: "name", label: "Nom du département", type: "text", required: true },
        selectField("status", "Statut", hrStatus.references),
        { name: "description", label: "Description", type: "textarea" },
      ],
      statusOptions: statusOptions(hrStatus.references),
      records: data.departments.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.name),
        subtitle: "Référentiel département",
        status: stringOf(item.status),
        notes: stringOrNull(item.description),
        createdAt: stringOf(item.createdAt),
        meta: [],
        values: fieldValues(item, ["name", "status", "description"]),
      })),
    },
    {
      id: "accounts",
      label: "Manager les comptes",
      description: "Comptes financiers utilisés par les entrées, sorties, budgets et paiements de paie.",
      endpoint: "/api/admin/hr-cfo/accounts",
      fields: [
        { name: "name", label: "Nom du compte", type: "text", required: true },
        selectField("accountType", "Type de compte", ["CASH", "BANK", "MOBILE_MONEY", "PROJECT", "OPERATIONS"]),
        { name: "openingBalance", label: "Solde initial", type: "number" },
        selectField("status", "Statut", hrStatus.references),
        { name: "description", label: "Description", type: "textarea" },
      ],
      statusOptions: statusOptions(hrStatus.references),
      records: data.accounts.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.name),
        subtitle: formatEnumLabel(stringOf(item.accountType)),
        status: stringOf(item.status),
        amount: numberOf(item.currentBalance),
        currency: "USD",
        notes: stringOrNull(item.description),
        createdAt: stringOf(item.createdAt),
        meta: [`Solde initial: ${numberOf(item.openingBalance)?.toFixed(2) || "0.00"} USD`],
        values: fieldValues(item, ["name", "accountType", "openingBalance", "status", "description"]),
      })),
    },
    {
      id: "positions",
      label: "Manager les postes",
      description: "Référentiel officiel des postes DTSC. Les permissions métier CEO, COO, HR & CFO, SCO, CTO et MPO se basent sur ces codes.",
      endpoint: "/api/admin/hr-cfo/positions",
      fields: [
        { name: "title", label: "Titre du poste", type: "text", required: true },
        { name: "code", label: "Code stable", type: "text", required: true, placeholder: "CEO, COO, HR_CFO..." },
        { name: "departmentId", label: "Département associé", type: "select", options: departmentOptions },
        { name: "hierarchyLevel", label: "Niveau hiérarchique", type: "number" },
        selectField("status", "Statut", hrStatus.references),
        { name: "permissions", label: "Permissions métier", type: "textarea", placeholder: "Ex: CEO_SUPERVISION, SCO_OPERATIONS" },
        { name: "description", label: "Description", type: "textarea" },
      ],
      statusOptions: statusOptions(hrStatus.references),
      records: data.positions.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${stringOf(item.code)} · Niveau ${stringOf(item.hierarchyLevel) || "50"}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.description),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([stringOf(item.departmentName), stringOf(item.permissions)]),
        values: fieldValues(item, ["title", "code", "departmentId", "hierarchyLevel", "status", "permissions", "description"]),
      })),
    },
    {
      id: "employees",
      label: "Collaborateurs & dossiers RH",
      description: "Dossier RH lié aux membres internes existants. Le nom et l'email viennent du compte utilisateur et ne sont pas modifiés ici.",
      endpoint: "/api/admin/hr-cfo/employees",
      fields: [
        { name: "userId", label: "Collaborateur", type: "select", required: true, options: staffOptions, helperText: "Seuls les membres non-client actifs ou suspendus sont proposés." },
        { name: "userEmailPreview", label: "Email du collaborateur", type: "preview", previewFor: "userId", helperText: "Lecture seule: l'email vient du compte utilisateur sélectionné." },
        { name: "departmentId", label: "Département", type: "select", required: true, options: departmentOptions },
        { name: "positionId", label: "Poste", type: "select", required: true, options: positionOptions, helperText: "Liste officielle des postes DTSC. Les droits métier se basent sur ce choix." },
        selectField("contractType", "Contrat", ["PERMANENT", "CONSULTANT", "PART_TIME", "INTERN", "TEMPORARY"]),
        selectField("status", "Statut", hrStatus.employees),
        { name: "startDate", label: "Date d'entrée", type: "date" },
        { name: "monthlyCompensation", label: "Rémunération mensuelle", type: "number" },
        { name: "managerUserId", label: "Responsable", type: "select", options: employeeUserOptions, helperText: "Liste alimentée par les collaborateurs déjà enregistrés." },
        selectField("complianceStatus", "Conformité", ["COMPLETE", "TO_REVIEW", "MISSING_DOCUMENTS", "EXPIRED"]),
        { name: "skills", label: "Compétences", type: "textarea" },
        { name: "kpis", label: "KPIs / objectifs", type: "textarea" },
        { name: "notes", label: "Notes RH", type: "textarea" },
      ],
      statusOptions: statusOptions(hrStatus.employees),
      records: data.employees.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.fullName),
        subtitle: `${stringOf(item.positionTitle || item.jobTitle)} · ${stringOf(item.department)}`,
        status: stringOf(item.status),
        amount: numberOf(item.monthlyCompensation),
        currency: "USD",
        notes: stringOrNull(item.notes),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([
          formatEnumLabel(stringOf(item.contractType)),
          `Conformité: ${formatEnumLabel(stringOf(item.complianceStatus))}`,
          stringOf(item.managerName) ? `Responsable: ${stringOf(item.managerName)}` : "",
          stringOf(item.kpis) ? "KPIs définis" : "",
        ]),
        values: fieldValues(item, ["userId", "departmentId", "positionId", "contractType", "status", "startDate", "monthlyCompensation", "managerUserId", "complianceStatus", "skills", "kpis", "notes"]),
      })),
    },
    {
      id: "budgets",
      label: "Budgets & contrôle",
      description: "Budget financé par un compte actif. La création est bloquée si le solde disponible du compte est insuffisant.",
      endpoint: "/api/admin/hr-cfo/budgets",
      fields: [
        { name: "name", label: "Budget", type: "text", required: true },
        { name: "departmentId", label: "Département", type: "select", required: true, options: departmentOptions },
        { name: "accountId", label: "Compte source", type: "select", required: true, options: accountOptions },
        { name: "periodStart", label: "Début période", type: "date" },
        { name: "periodEnd", label: "Fin période", type: "date" },
        { name: "amount", label: "Montant initial", type: "number", required: true },
        selectField("status", "Statut", hrStatus.budgets),
        selectField("riskLevel", "Risque", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        { name: "notes", label: "Commentaires", type: "textarea" },
      ],
      statusOptions: statusOptions(hrStatus.budgets),
      records: data.budgets.map((item) => {
        const remaining = budgetRemaining(item);
        const amount = numberOf(item.amount) || 0;
        const spent = numberOf(item.spentAmount) || 0;
        const percent = amount > 0 ? Math.min(100, Math.round((spent / amount) * 100)) : 0;
        return {
          id: stringOf(item.id),
          title: stringOf(item.name),
          subtitle: stringOf(item.ownerDepartment),
          status: stringOf(item.status),
          amount,
          currency: "USD",
          notes: stringOrNull(item.notes),
          createdAt: stringOf(item.createdAt),
          meta: [`Consommé: ${spent.toFixed(2)} USD`, `Solde: ${remaining.toFixed(2)} USD`, `Utilisation: ${percent}%`, `Risque: ${formatEnumLabel(stringOf(item.riskLevel))}`],
          values: fieldValues(item, ["name", "departmentId", "accountId", "periodStart", "periodEnd", "amount", "status", "riskLevel", "notes"]),
        };
      }),
    },
    {
      id: "transactions",
      label: "Transactions",
      description: "Centre des mouvements financiers DTSC: entrées, sorties, compte, budget, validation et facture automatique.",
      endpoint: "/api/admin/hr-cfo/transactions",
      fields: [
        selectField("transactionType", "Type de transaction", ["MANUAL", "SUBSCRIPTION", "PAYROLL", "SCO"]),
        selectField("transactionCategory", "Catégorie", ["IN", "OUT"]),
        { name: "title", label: "Libellé", type: "text", required: true, placeholder: "Paiement client, achat matériel, salaire..." },
        { name: "amount", label: "Montant", type: "number", required: true },
        { name: "transactionDate", label: "Date", type: "date" },
        { name: "accountId", label: "Compte", type: "select", options: accountOptions, helperText: "Obligatoire pour une entrée. Pour une sortie, le compte est déduit du budget sélectionné." },
        { name: "departmentId", label: "Département", type: "select", options: departmentOptions },
        { name: "budgetId", label: "Budget concerné", type: "select", options: budgetOptions, helperText: "Obligatoire pour une sortie validée." },
        { name: "paymentMethod", label: "Moyen de paiement", type: "text", placeholder: "Espèces, banque, mobile money..." },
        { name: "attachmentUrl", label: "Pièce justificative", type: "file", helperText: "Import PDF, image ou document. Le fichier est stocké côté serveur dans Supabase." },
        selectField("status", "Statut", hrStatus.transactions),
        { name: "notes", label: "Notes / commentaires", type: "textarea" },
      ],
      statusOptions: statusOptions(hrStatus.transactions),
      records: data.transactions.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${formatEnumLabel(stringOf(item.transactionCategory))} · ${formatDate(item.transactionDate)}`,
        status: stringOf(item.status),
        amount: numberOf(item.amount),
        currency: stringOf(item.currency) || "USD",
        notes: stringOrNull(item.notes),
        createdAt: stringOf(item.createdAt),
        href: stringOf(item.invoiceId) ? `/api/invoices/${stringOf(item.invoiceId)}/pdf` : null,
        meta: compactStrings([formatEnumLabel(stringOf(item.transactionType)), stringOf(item.accountName), stringOf(item.budgetName), stringOf(item.departmentName)]),
        values: fieldValues(item, ["transactionType", "transactionCategory", "title", "amount", "transactionDate", "accountId", "departmentId", "budgetId", "paymentMethod", "attachmentUrl", "status", "notes"]),
      })),
    },
    {
      id: "payrolls",
      label: "Gestion de la paie",
      description: "Paies par collaborateur et budget. Le salaire brut vient automatiquement du dossier RH et le compte est déduit du budget.",
      endpoint: "/api/admin/hr-cfo/payrolls",
      fields: [
        { name: "employeeId", label: "Collaborateur", type: "select", required: true, options: employeeOptions },
        { name: "grossAmountPreview", label: "Montant brut automatique", type: "preview", previewFor: "employeeId", helperText: "Lecture seule: rémunération mensuelle issue du dossier RH." },
        { name: "periodStart", label: "Début période", type: "date", required: true },
        { name: "periodEnd", label: "Fin période", type: "date", required: true },
        { name: "bonusAmount", label: "Primes", type: "number" },
        { name: "deductionAmount", label: "Retenues", type: "number" },
        { name: "budgetId", label: "Budget concerné", type: "select", required: true, options: budgetOptions },
        selectField("status", "Statut de paie", hrStatus.payrolls),
        { name: "notes", label: "Notes", type: "textarea" },
      ],
      statusOptions: statusOptions(hrStatus.payrolls),
      records: data.payrolls.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.employeeName),
        subtitle: `${formatDate(item.periodStart)} - ${formatDate(item.periodEnd)}`,
        status: stringOf(item.status),
        amount: numberOf(item.netAmount),
        currency: "USD",
        notes: stringOrNull(item.notes),
        createdAt: stringOf(item.createdAt),
        href: stringOf(item.id) ? `/api/admin/payrolls/${stringOf(item.id)}/pdf` : null,
        hrefLabel: "Télécharger le bulletin de paie",
        meta: compactStrings([`Brut: ${(numberOf(item.grossAmount) || 0).toFixed(2)} USD`, stringOf(item.accountName), stringOf(item.budgetName)]),
        values: fieldValues(item, ["employeeId", "periodStart", "periodEnd", "bonusAmount", "deductionAmount", "budgetId", "status", "notes"]),
      })),
    },
  ];
}

export function buildScoDatasets(data: {
  materialItems: Array<Record<string, unknown>>;
  employees: Array<Record<string, unknown>>;
  vendors: Array<Record<string, unknown>>;
  purchaseRequests: Array<Record<string, unknown>>;
  inventory: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  logistics: Array<Record<string, unknown>>;
  departments?: Array<Record<string, unknown>>;
  budgets?: Array<Record<string, unknown>>;
  mpoProjects?: Array<Record<string, unknown>>;
  ctoProjects?: Array<Record<string, unknown>>;
  cooTasks?: Array<Record<string, unknown>>;
}): OperationDataset[] {
  const activeVendorOptions = data.vendors
    .filter((vendor) => stringOf(vendor.status) === "ACTIVE" || stringOf(vendor.status) === "WATCHLIST")
    .map((vendor) => option(vendor.name, `${stringOf(vendor.name)} · ${stringOf(vendor.category)}`));
  const materialOptions = data.materialItems
    .filter((item) => stringOf(item.status) === "ACTIVE")
    .map((item) => option(item.id, `${stringOf(item.name)} · ${formatEnumLabel(stringOf(item.itemType))} · ${stringOf(item.category)}`));
  const employeeNameOptions = data.employees
    .filter((employee) => stringOf(employee.status) !== "EXITED")
    .map((employee) => option(employee.fullName, `${stringOf(employee.fullName)} · ${stringOf(employee.email)}`));
  const departmentOptions = (data.departments || [])
    .filter((department) => stringOf(department.status) === "ACTIVE")
    .map((department) => option(department.id, stringOf(department.name)));
  const budgetOptions = (data.budgets || [])
    .filter((budget) => stringOf(budget.status) !== "CLOSED")
    .map((budget) => option(budget.id, `${stringOf(budget.name)} · ${stringOf(budget.ownerDepartment)}`));
  const mpoProjectOptions = (data.mpoProjects || []).map((project) => option(project.id, `${stringOf(project.title)} · ${formatEnumLabel(stringOf(project.status))}`));
  const ctoProjectOptions = (data.ctoProjects || []).map((project) => option(project.id, `${stringOf(project.title)} · ${formatEnumLabel(stringOf(project.status))}`));
  const cooTaskOptions = (data.cooTasks || []).map((task) => option(task.id, `${stringOf(task.title)} · ${formatEnumLabel(stringOf(task.status))}`));

  return [
    {
      id: "materialItems",
      label: "Biens matériels DTSC",
      description: "Référentiel central des biens matériels utilisés ensuite par les stocks, inventaires, actifs et équipements.",
      endpoint: "/api/admin/sco/materialItems",
      fields: [
        { name: "name", label: "Nom du bien", type: "text", required: true },
        { name: "sku", label: "Référence / code", type: "text" },
        { name: "category", label: "Catégorie", type: "text", required: true },
        selectField("itemType", "Type de bien", ["STOCK", "ASSET", "EQUIPMENT", "CONSUMABLE", "SERVICE_TOOL"]),
        { name: "unit", label: "Unité", type: "text", placeholder: "unité" },
        { name: "quantity", label: "Quantité", type: "number" },
        selectField("condition", "État", ["AVAILABLE", "ASSIGNED", "MAINTENANCE", "LOST", "DAMAGED", "RETIRED", "ARCHIVED"]),
        { name: "location", label: "Localisation", type: "text" },
        { name: "currentOwnerName", label: "Responsable actuel", type: "select", options: employeeNameOptions },
        { name: "departmentId", label: "Département utilisateur", type: "select", options: departmentOptions },
        { name: "relatedProjectId", label: "Projet MPO lié", type: "select", options: mpoProjectOptions },
        { name: "relatedTechnicalProjectId", label: "Projet CTO lié", type: "select", options: ctoProjectOptions },
        { name: "vendorName", label: "Fournisseur d'origine", type: "select", options: activeVendorOptions },
        { name: "acquiredAt", label: "Date d'acquisition", type: "date" },
        { name: "estimatedValue", label: "Valeur estimée", type: "number" },
        selectField("status", "Statut", ["ACTIVE", "INACTIVE", "ARCHIVED"]),
        { name: "description", label: "Description", type: "textarea" },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ],
      statusOptions: statusOptions(["ACTIVE", "INACTIVE", "ARCHIVED"]),
      records: data.materialItems.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.name),
        subtitle: `${formatEnumLabel(stringOf(item.itemType))} · ${stringOf(item.category)}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.description),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([stringOf(item.sku), `Qté: ${stringOf(item.quantity) || "0"} ${stringOf(item.unit)}`, stringOf(item.location), stringOf(item.currentOwnerName), stringOf(item.vendorName)]),
        values: fieldValues(item, ["name", "sku", "category", "itemType", "unit", "quantity", "condition", "location", "currentOwnerName", "departmentId", "relatedProjectId", "relatedTechnicalProjectId", "vendorName", "acquiredAt", "estimatedValue", "status", "description", "comments"]),
      })),
    },
    {
      id: "vendors",
      label: "Fournisseurs",
      description: "Répertoire fournisseurs, fiabilité, délais moyens, contacts et conditions de paiement.",
      endpoint: "/api/admin/sco/vendors",
      fields: [
        { name: "name", label: "Fournisseur", type: "text", required: true },
        { name: "category", label: "Catégorie", type: "text", required: true },
        selectField("vendorType", "Type fournisseur", ["IT_HARDWARE", "OFFICE_SUPPLIES", "CLOUD_SERVICES", "NETWORK_EQUIPMENT", "LOGISTICS", "TRANSPORT", "PRINTING", "MAINTENANCE", "TECHNICAL_PROVIDER", "OTHER"]),
        { name: "contactName", label: "Contact", type: "text" },
        { name: "email", label: "Email", type: "email" },
        { name: "phone", label: "Téléphone", type: "text" },
        { name: "address", label: "Adresse", type: "text" },
        { name: "productsServices", label: "Produits ou services fournis", type: "textarea" },
        selectField("serviceQuality", "Qualité du service", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        { name: "paymentTerms", label: "Conditions paiement", type: "text" },
        { name: "documentUrl", label: "Documents associés", type: "file" },
        selectField("criticality", "Criticité", ["LOW", "NORMAL", "HIGH", "CRITICAL"]),
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
        meta: compactStrings([formatEnumLabel(stringOf(item.vendorType)), `Score: ${stringOf(item.reliabilityScore)}/100`, `${stringOf(item.avgLeadTimeDays)} j`, stringOf(item.contactName), formatEnumLabel(stringOf(item.criticality))]),
        values: fieldValues(item, ["name", "category", "vendorType", "contactName", "email", "phone", "address", "productsServices", "serviceQuality", "paymentTerms", "documentUrl", "criticality", "reliabilityScore", "avgLeadTimeDays", "status", "notes"]),
      })),
    },
    {
      id: "purchaseRequests",
      label: "Demandes d'achat",
      description: "Besoins opérationnels, justification, budget, urgence, fournisseur pressenti et statut de commande.",
      endpoint: "/api/admin/sco/purchaseRequests",
      fields: [
        { name: "title", label: "Besoin", type: "text", required: true },
        { name: "requesterName", label: "Demandeur", type: "select", required: true, options: employeeNameOptions },
        { name: "requesterDepartmentId", label: "Département demandeur", type: "select", options: departmentOptions },
        selectField("sourceSection", "Section source", ["SCO", "HR_CFO", "COO", "CTO", "MPO", "CEO", "ACTIVITIES"]),
        { name: "sourceItemId", label: "ID objet source", type: "text" },
        { name: "destinationSection", label: "Destination", type: "text", placeholder: "HR_CFO, CEO, COO..." },
        { name: "project", label: "Projet/mission", type: "text" },
        { name: "relatedProjectId", label: "Projet MPO lié", type: "select", options: mpoProjectOptions },
        { name: "relatedBudgetId", label: "Budget HR & CFO lié", type: "select", options: budgetOptions },
        { name: "relatedAssetId", label: "Actif lié", type: "select", options: data.assets.map((asset) => option(asset.id, `${stringOf(asset.tag)} · ${stringOf(asset.name)}`)) },
        { name: "relatedTaskId", label: "Tâche COO liée", type: "select", options: cooTaskOptions },
        { name: "relatedMissionId", label: "Mission liée", type: "select", options: data.logistics.map((mission) => option(mission.id, stringOf(mission.title))) },
        { name: "requestedItemName", label: "Bien demandé", type: "text" },
        { name: "requestedQuantity", label: "Quantité", type: "number" },
        selectField("urgency", "Priorité", ["LOW", "NORMAL", "HIGH", "CRITICAL"]),
        { name: "estimatedAmount", label: "Montant estimé", type: "number" },
        { name: "currency", label: "Devise", type: "text", placeholder: "USD" },
        selectField("status", "Statut", scoStatus.purchaseRequests),
        selectField("budgetStatus", "Budget", ["PENDING_REVIEW", "AVAILABLE", "INSUFFICIENT", "APPROVED"]),
        { name: "selectedVendorName", label: "Fournisseur retenu", type: "select", options: activeVendorOptions, helperText: "Liste issue du formulaire Fournisseurs." },
        { name: "proposedVendorName", label: "Fournisseur proposé", type: "select", options: activeVendorOptions },
        { name: "requestedAt", label: "Date de demande", type: "date" },
        { name: "neededBy", label: "Besoin avant", type: "date" },
        { name: "attachmentUrl", label: "Justificatif", type: "file" },
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
        meta: compactStrings([formatEnumLabel(stringOf(item.urgency)), `Budget: ${formatEnumLabel(stringOf(item.budgetStatus))}`, stringOf(item.selectedVendorName), stringOf(item.sourceSection), formatDate(item.neededBy)]),
        values: fieldValues(item, ["title", "requesterName", "requesterDepartmentId", "sourceSection", "sourceItemId", "destinationSection", "project", "relatedProjectId", "relatedBudgetId", "relatedAssetId", "relatedTaskId", "relatedMissionId", "requestedItemName", "requestedQuantity", "urgency", "estimatedAmount", "currency", "status", "budgetStatus", "selectedVendorName", "proposedVendorName", "requestedAt", "neededBy", "attachmentUrl", "justification", "notes"]),
      })),
    },
    {
      id: "inventory",
      label: "Stocks & inventaire",
      description: "Articles, quantités, seuils minimums, emplacements et inventaires périodiques.",
      endpoint: "/api/admin/sco/inventory",
      fields: [
        { name: "materialItemId", label: "Bien matériel", type: "select", options: materialOptions, helperText: "Optionnel: lie cet inventaire au référentiel des biens matériels DTSC." },
        { name: "name", label: "Article", type: "text", required: true },
        { name: "sku", label: "Référence", type: "text" },
        { name: "category", label: "Catégorie", type: "text", required: true },
        { name: "quantity", label: "Quantité", type: "number" },
        { name: "minimumQuantity", label: "Seuil minimum", type: "number" },
        { name: "unit", label: "Unité", type: "text" },
        { name: "location", label: "Emplacement", type: "text" },
        { name: "usualVendorName", label: "Fournisseur habituel", type: "select", options: activeVendorOptions },
        { name: "ownerName", label: "Responsable", type: "select", options: employeeNameOptions },
        { name: "lastEntryAt", label: "Dernière entrée", type: "date" },
        { name: "lastExitAt", label: "Dernière sortie", type: "date" },
        selectField("movementType", "Mouvement", ["STOCK_IN", "STOCK_OUT", "RETURN", "LOSS", "DAMAGE", "ADJUSTMENT"]),
        { name: "relatedProjectId", label: "Projet MPO lié", type: "select", options: mpoProjectOptions },
        { name: "relatedTaskId", label: "Tâche COO liée", type: "select", options: cooTaskOptions },
        { name: "relatedMissionId", label: "Mission liée", type: "select", options: data.logistics.map((mission) => option(mission.id, stringOf(mission.title))) },
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
        meta: compactStrings([`Qté: ${stringOf(item.quantity)} ${stringOf(item.unit)}`, `Seuil: ${stringOf(item.minimumQuantity)}`, stringOf(item.ownerName), stringOf(item.usualVendorName), formatEnumLabel(stringOf(item.movementType))]),
        values: fieldValues(item, ["materialItemId", "name", "sku", "category", "quantity", "minimumQuantity", "unit", "location", "usualVendorName", "ownerName", "lastEntryAt", "lastExitAt", "movementType", "relatedProjectId", "relatedTaskId", "relatedMissionId", "status", "lastInventoryAt", "notes"]),
      })),
    },
    {
      id: "assets",
      label: "Actifs & équipements",
      description: "Matériel IT, imprimantes, supports terrain, assignations, état et maintenance.",
      endpoint: "/api/admin/sco/assets",
      fields: [
        { name: "materialItemId", label: "Bien matériel", type: "select", options: materialOptions, helperText: "Optionnel: lie cet actif au référentiel des biens matériels DTSC." },
        { name: "tag", label: "Tag", type: "text", required: true },
        { name: "name", label: "Équipement", type: "text", required: true },
        { name: "category", label: "Catégorie", type: "text", required: true },
        { name: "brandModel", label: "Marque / modèle", type: "text" },
        { name: "serialNumber", label: "Numéro de série", type: "text" },
        { name: "estimatedValue", label: "Valeur estimée", type: "number" },
        { name: "vendorName", label: "Fournisseur", type: "select", options: activeVendorOptions },
        { name: "assignedTo", label: "Assigné à", type: "select", options: employeeNameOptions },
        { name: "departmentId", label: "Département", type: "select", options: departmentOptions },
        { name: "relatedProjectId", label: "Projet MPO lié", type: "select", options: mpoProjectOptions },
        { name: "relatedTechnicalProjectId", label: "Projet CTO lié", type: "select", options: ctoProjectOptions },
        { name: "purchaseRequestId", label: "Demande d'achat liée", type: "select", options: data.purchaseRequests.map((request) => option(request.id, stringOf(request.title))) },
        selectField("condition", "État", ["NEW", "GOOD", "FAIR", "DAMAGED", "REPAIR"]),
        selectField("status", "Statut", scoStatus.assets),
        { name: "purchaseDate", label: "Date achat", type: "date" },
        { name: "maintenanceDueAt", label: "Maintenance prévue", type: "date" },
        { name: "assignmentHistory", label: "Historique d'affectation", type: "textarea" },
        { name: "maintenanceHistory", label: "Historique maintenance", type: "textarea" },
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
        meta: compactStrings([`État: ${formatEnumLabel(stringOf(item.condition))}`, stringOf(item.assignedTo), stringOf(item.vendorName), stringOf(item.departmentName), formatDate(item.maintenanceDueAt)]),
        values: fieldValues(item, ["materialItemId", "tag", "name", "category", "brandModel", "serialNumber", "estimatedValue", "vendorName", "assignedTo", "departmentId", "relatedProjectId", "relatedTechnicalProjectId", "purchaseRequestId", "condition", "status", "purchaseDate", "maintenanceDueAt", "assignmentHistory", "maintenanceHistory", "notes"]),
      })),
    },
    {
      id: "logistics",
      label: "Missions & logistique",
      description: "Préparation des formations, événements, missions terrain, checklists et risques opérationnels.",
      endpoint: "/api/admin/sco/logistics",
      fields: [
        { name: "title", label: "Mission/événement", type: "text", required: true },
        selectField("missionType", "Type de mission", ["CLIENT_MISSION", "TRAINING", "EVENT", "TECHNICAL_INTERVENTION", "EXTERNAL_MEETING", "DELIVERY", "INSTALLATION", "FIELD_SUPPORT", "PROJECT_PRESENTATION", "OTHER"]),
        { name: "location", label: "Lieu", type: "text", required: true },
        { name: "eventDate", label: "Date", type: "date" },
        { name: "requesterName", label: "Demandeur", type: "select", options: employeeNameOptions },
        { name: "departmentId", label: "Département", type: "select", options: departmentOptions },
        { name: "relatedProjectId", label: "Projet MPO lié", type: "select", options: mpoProjectOptions },
        { name: "relatedTechnicalProjectId", label: "Projet CTO lié", type: "select", options: ctoProjectOptions },
        { name: "relatedTaskId", label: "Tâche COO liée", type: "select", options: cooTaskOptions },
        { name: "participants", label: "Participants", type: "textarea" },
        { name: "logisticsNeeds", label: "Besoins logistiques", type: "textarea" },
        { name: "requiredMaterial", label: "Matériel nécessaire", type: "textarea" },
        { name: "estimatedBudget", label: "Budget estimé", type: "number" },
        { name: "ownerName", label: "Responsable", type: "select", required: true, options: employeeNameOptions },
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
        meta: compactStrings([formatEnumLabel(stringOf(item.missionType)), formatDate(item.eventDate), stringOf(item.departmentName), stringOf(item.transportPlan) ? "Transport cadré" : "", stringOf(item.equipmentChecklist) ? "Checklist prête" : ""]),
        values: fieldValues(item, ["title", "missionType", "location", "eventDate", "requesterName", "departmentId", "relatedProjectId", "relatedTechnicalProjectId", "relatedTaskId", "participants", "logisticsNeeds", "requiredMaterial", "estimatedBudget", "ownerName", "status", "transportPlan", "equipmentChecklist", "riskNotes", "notes"]),
      })),
    },
  ];
}

export function buildMpoDatasets(data: {
  projects: Array<Record<string, unknown>>;
  records: Array<Record<string, unknown>>;
  departments: Array<Record<string, unknown>>;
  employees: Array<Record<string, unknown>>;
}): OperationDataset[] {
  const departmentOptions = data.departments
    .filter((department) => stringOf(department.status) === "ACTIVE")
    .map((department) => option(department.id, stringOf(department.name)));
  const employeeOptions = data.employees
    .filter((employee) => stringOf(employee.status) !== "EXITED")
    .map((employee) => option(employee.id, `${stringOf(employee.fullName)} · ${stringOf(employee.email)}`));
  const projectOptions = data.projects.map((project) => option(project.id, `${stringOf(project.title)} · ${formatEnumLabel(stringOf(project.status))}`));

  return [
    {
      id: "projects",
      label: "Portefeuille de projets",
      description: "Projets numériques DTSC: cadrage, responsables, CTO/COO/RH & CFO/SCO impliqués, risques, budget et livrables.",
      endpoint: "/api/admin/mpo/projects",
      fields: [
        { name: "title", label: "Titre du projet", type: "text", required: true },
        selectField("projectType", "Type de projet", ["WEB_APP", "MOBILE_APP", "SAAS_PLATFORM", "BI_DASHBOARD", "DATA_PROJECT", "AI_PROJECT", "AUTOMATION", "CHATBOT", "ERP", "CRM", "CLIENT_PORTAL", "DIGITAL_HEALTH", "INTERNAL_DTSC", "CLIENT_PROJECT", "DIGITAL_TRANSFORMATION", "OTHER"]),
        { name: "requester", label: "Client ou département demandeur", type: "text" },
        { name: "responsibleMpoId", label: "Responsable MPO", type: "select", options: employeeOptions },
        { name: "ctoEmployeeId", label: "CTO impliqué", type: "select", options: employeeOptions },
        { name: "cooEmployeeId", label: "COO impliqué", type: "select", options: employeeOptions },
        { name: "hrCfoEmployeeId", label: "RH & CFO impliqué", type: "select", options: employeeOptions },
        { name: "scoEmployeeId", label: "SCO impliqué", type: "select", options: employeeOptions },
        { name: "ceoEmployeeId", label: "CEO impliqué", type: "select", options: employeeOptions },
        selectField("priority", "Priorité", ["LOW", "NORMAL", "HIGH", "CRITICAL"]),
        selectField("complexity", "Complexité", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        selectField("riskLevel", "Niveau de risque", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        { name: "estimatedBudget", label: "Budget estimé", type: "number" },
        selectField("status", "Statut", mpoStatus.projects),
        { name: "startDate", label: "Début", type: "date" },
        { name: "dueDate", label: "Échéance", type: "date" },
        { name: "needDescription", label: "Description du besoin", type: "textarea" },
        { name: "businessObjective", label: "Objectif business", type: "textarea" },
        { name: "technicalObjective", label: "Objectif technique", type: "textarea" },
        { name: "collaborators", label: "Collaborateurs impliqués", type: "textarea" },
        { name: "expectedDeliverables", label: "Livrables attendus", type: "textarea" },
        { name: "associatedDocuments", label: "Documents associés", type: "textarea" },
        { name: "healthDigitalCategory", label: "Catégorie santé digitale", type: "text" },
        { name: "healthObjective", label: "Objectif médical", type: "textarea" },
        { name: "medicalDataConcerned", label: "Données médicales concernées", type: "textarea" },
        { name: "medicalRisk", label: "Risque médical", type: "textarea" },
        { name: "confidentialityConstraint", label: "Contrainte confidentialité", type: "textarea" },
        { name: "healthValidation", label: "Validation métier santé", type: "textarea" },
        { name: "ethicalCompliance", label: "Conformité éthique", type: "textarea" },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ],
      statusOptions: statusOptions(mpoStatus.projects),
      records: data.projects.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${formatEnumLabel(stringOf(item.projectType))} · ${stringOf(item.requester)}`,
        status: stringOf(item.status),
        amount: numberOf(item.estimatedBudget),
        currency: "USD",
        notes: stringOrNull(item.comments || item.needDescription),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([formatEnumLabel(stringOf(item.priority)), `Risque: ${formatEnumLabel(stringOf(item.riskLevel))}`, stringOf(item.responsibleMpoName), stringOf(item.ctoEmployeeName), formatDate(item.dueDate)]),
        values: fieldValues(item, ["title", "projectType", "requester", "needDescription", "businessObjective", "technicalObjective", "responsibleMpoId", "ctoEmployeeId", "cooEmployeeId", "hrCfoEmployeeId", "scoEmployeeId", "ceoEmployeeId", "collaborators", "priority", "complexity", "riskLevel", "estimatedBudget", "status", "startDate", "dueDate", "expectedDeliverables", "associatedDocuments", "healthDigitalCategory", "healthObjective", "medicalDataConcerned", "medicalRisk", "confidentialityConstraint", "healthValidation", "ethicalCompliance", "comments"]),
      })),
    },
    {
      id: "records",
      label: "Registres MPO",
      description: "Cadrage, cahiers de charges, livrables, risques, rapports, workflows, documentation, besoins budgétaires et matériels.",
      endpoint: "/api/admin/mpo/records",
      fields: [
        selectField("recordType", "Bloc MPO", ["NEEDS_ASSESSMENT", "SPECIFICATION", "DELIVERABLE", "RISK_BLOCKER", "CTO_COLLABORATION", "COO_COORDINATION", "BUDGET_REQUEST", "SCO_MATERIAL_REQUEST", "DIGITAL_HEALTH", "PROJECT_REPORT", "PROJECT_WORKFLOW", "PROJECT_DOCUMENTATION", "DIGITAL_OPPORTUNITY"]),
        { name: "projectId", label: "Projet lié", type: "select", options: projectOptions },
        { name: "title", label: "Titre", type: "text", required: true },
        selectField("status", "Statut", mpoStatus.records),
        selectField("priority", "Priorité", ["LOW", "NORMAL", "HIGH", "CRITICAL"]),
        { name: "category", label: "Catégorie", type: "text" },
        { name: "departmentId", label: "Département", type: "select", options: departmentOptions },
        { name: "responsibleEmployeeId", label: "Responsable", type: "select", options: employeeOptions },
        { name: "targetEmployeeId", label: "Destinataire / collaborateur concerné", type: "select", options: employeeOptions },
        { name: "amount", label: "Montant estimé", type: "number" },
        { name: "startDate", label: "Début", type: "date" },
        { name: "dueDate", label: "Échéance", type: "date" },
        { name: "progress", label: "Progression %", type: "number" },
        { name: "description", label: "Description", type: "textarea" },
        { name: "content", label: "Contenu détaillé", type: "textarea" },
        { name: "attachmentUrl", label: "Document associé", type: "file" },
        { name: "notes", label: "Notes", type: "textarea" },
      ],
      statusOptions: statusOptions(mpoStatus.records),
      records: data.records.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${formatEnumLabel(stringOf(item.recordType))} · ${stringOf(item.projectTitle)}`,
        status: stringOf(item.status),
        amount: numberOf(item.amount),
        currency: "USD",
        notes: stringOrNull(item.notes || item.description || item.content),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([formatEnumLabel(stringOf(item.priority)), stringOf(item.responsibleName), stringOf(item.targetEmployeeName), formatDate(item.dueDate)]),
        values: fieldValues(item, ["recordType", "projectId", "title", "status", "priority", "category", "departmentId", "responsibleEmployeeId", "targetEmployeeId", "amount", "startDate", "dueDate", "progress", "description", "content", "attachmentUrl", "notes"]),
      })),
    },
  ];
}

export function buildCtoDatasets(data: {
  projects: Array<Record<string, unknown>>;
  records: Array<Record<string, unknown>>;
  mpoProjects: Array<Record<string, unknown>>;
  departments: Array<Record<string, unknown>>;
  employees: Array<Record<string, unknown>>;
}): OperationDataset[] {
  const departmentOptions = data.departments
    .filter((department) => stringOf(department.status) === "ACTIVE")
    .map((department) => option(department.id, stringOf(department.name)));
  const employeeOptions = data.employees
    .filter((employee) => stringOf(employee.status) !== "EXITED")
    .map((employee) => option(employee.id, `${stringOf(employee.fullName)} · ${stringOf(employee.email)}`));
  const mpoProjectOptions = data.mpoProjects.map((project) => option(project.id, `${stringOf(project.title)} · ${formatEnumLabel(stringOf(project.status))}`));
  const technicalProjectOptions = data.projects.map((project) => option(project.id, `${stringOf(project.title)} · ${formatEnumLabel(stringOf(project.status))}`));

  return [
    {
      id: "projects",
      label: "Projets techniques",
      description: "Projets transmis ou créés par le CTO: analyse, développement, tests, production, stack, dépôt et livrables techniques.",
      endpoint: "/api/admin/cto/projects",
      fields: [
        { name: "title", label: "Titre du projet technique", type: "text", required: true },
        { name: "mpoProjectId", label: "Projet MPO lié", type: "select", options: mpoProjectOptions },
        selectField("solutionType", "Type de solution", ["WEB_APP", "MOBILE_APP", "API", "BACKEND", "FRONTEND", "BI_DASHBOARD", "AUTOMATION", "AI_ML", "CHATBOT", "DATABASE", "EXTERNAL_INTEGRATION", "INFRASTRUCTURE", "SECURITY", "OTHER"]),
        { name: "responsibleCtoId", label: "Responsable CTO", type: "select", options: employeeOptions },
        selectField("priority", "Priorité", ["LOW", "NORMAL", "HIGH", "CRITICAL"]),
        selectField("complexity", "Complexité", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        selectField("riskLevel", "Risque technique", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        selectField("status", "Statut", ctoStatus.projects),
        selectField("environment", "Environnement", ["DEVELOPMENT", "TEST", "PREPRODUCTION", "PRODUCTION"]),
        { name: "startDate", label: "Début", type: "date" },
        { name: "dueDate", label: "Échéance", type: "date" },
        { name: "repositoryUrl", label: "Dépôt GitHub / repo", type: "text" },
        { name: "documentationUrl", label: "Documentation associée", type: "text" },
        { name: "functionalSummary", label: "Résumé fonctionnel", type: "textarea" },
        { name: "technicalObjective", label: "Objectif technique", type: "textarea" },
        { name: "technicalCollaborators", label: "Collaborateurs techniques", type: "textarea" },
        { name: "techStack", label: "Stack technique", type: "textarea" },
        { name: "expectedTechnicalDeliverables", label: "Livrables techniques attendus", type: "textarea" },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ],
      statusOptions: statusOptions(ctoStatus.projects),
      records: data.projects.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${formatEnumLabel(stringOf(item.solutionType))} · ${stringOf(item.mpoProjectTitle)}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.comments || item.technicalObjective || item.functionalSummary),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([formatEnumLabel(stringOf(item.priority)), `Risque: ${formatEnumLabel(stringOf(item.riskLevel))}`, stringOf(item.responsibleCtoName), stringOf(item.environment), formatDate(item.dueDate)]),
        values: fieldValues(item, ["title", "mpoProjectId", "solutionType", "functionalSummary", "technicalObjective", "responsibleCtoId", "technicalCollaborators", "priority", "complexity", "riskLevel", "techStack", "status", "startDate", "dueDate", "environment", "repositoryUrl", "documentationUrl", "expectedTechnicalDeliverables", "comments"]),
      })),
    },
    {
      id: "records",
      label: "Registres CTO",
      description: "Architecture, tâches techniques, APIs, bases de données, déploiements, sécurité, bugs, documentation, qualité et rapports CTO.",
      endpoint: "/api/admin/cto/records",
      fields: [
        selectField("recordType", "Bloc CTO", ["ARCHITECTURE", "TECH_TASK", "API_INTEGRATION", "DATABASE_MODEL", "DEPLOYMENT", "SECURITY_REVIEW", "BUG_INCIDENT", "TECH_DOCUMENTATION", "QUALITY_REVIEW", "MPO_COLLABORATION", "COO_COORDINATION", "BUDGET_NEED", "SCO_MATERIAL_NEED", "INNOVATION", "CTO_REPORT"]),
        { name: "technicalProjectId", label: "Projet technique lié", type: "select", options: technicalProjectOptions },
        { name: "mpoProjectId", label: "Projet MPO lié", type: "select", options: mpoProjectOptions },
        { name: "title", label: "Titre", type: "text", required: true },
        selectField("status", "Statut", ctoStatus.records),
        selectField("priority", "Priorité", ["LOW", "NORMAL", "HIGH", "CRITICAL"]),
        { name: "category", label: "Catégorie", type: "text" },
        { name: "departmentId", label: "Département", type: "select", options: departmentOptions },
        { name: "responsibleEmployeeId", label: "Responsable", type: "select", options: employeeOptions },
        { name: "assigneeEmployeeId", label: "Assigné à", type: "select", options: employeeOptions },
        { name: "provider", label: "Fournisseur / service", type: "text" },
        selectField("environment", "Environnement", ["DEVELOPMENT", "TEST", "PREPRODUCTION", "PRODUCTION"]),
        { name: "repositoryUrl", label: "Branche, PR ou repo", type: "text" },
        { name: "amount", label: "Budget estimé", type: "number" },
        { name: "startDate", label: "Début", type: "date" },
        { name: "dueDate", label: "Échéance", type: "date" },
        { name: "progress", label: "Progression %", type: "number" },
        { name: "description", label: "Description", type: "textarea" },
        { name: "content", label: "Contenu détaillé", type: "textarea" },
        { name: "attachmentUrl", label: "Document / preuve", type: "file" },
        { name: "notes", label: "Notes", type: "textarea" },
      ],
      statusOptions: statusOptions(ctoStatus.records),
      records: data.records.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${formatEnumLabel(stringOf(item.recordType))} · ${stringOf(item.technicalProjectTitle)}`,
        status: stringOf(item.status),
        amount: numberOf(item.amount),
        currency: "USD",
        notes: stringOrNull(item.notes || item.description || item.content),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([formatEnumLabel(stringOf(item.priority)), stringOf(item.responsibleName), stringOf(item.assigneeName), stringOf(item.environment), formatDate(item.dueDate)]),
        values: fieldValues(item, ["recordType", "technicalProjectId", "mpoProjectId", "title", "status", "priority", "category", "departmentId", "responsibleEmployeeId", "assigneeEmployeeId", "provider", "environment", "repositoryUrl", "amount", "startDate", "dueDate", "progress", "description", "content", "attachmentUrl", "notes"]),
      })),
    },
  ];
}

export function buildLaDatasets(data: {
  cases: Array<Record<string, unknown>>;
  contracts: Array<Record<string, unknown>>;
  templates: Array<Record<string, unknown>>;
  risks: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
  disputes: Array<Record<string, unknown>>;
  requests: Array<Record<string, unknown>>;
  reports: Array<Record<string, unknown>>;
  departments: Array<Record<string, unknown>>;
  employees: Array<Record<string, unknown>>;
  mpoProjects: Array<Record<string, unknown>>;
  ctoProjects: Array<Record<string, unknown>>;
  scoPurchaseRequests: Array<Record<string, unknown>>;
}): OperationDataset[] {
  const departmentOptions = data.departments
    .filter((department) => stringOf(department.status) === "ACTIVE")
    .map((department) => option(department.id, stringOf(department.name)));
  const employeeOptions = data.employees
    .filter((employee) => stringOf(employee.status) !== "EXITED")
    .map((employee) => option(employee.id, `${stringOf(employee.fullName)} · ${stringOf(employee.email)}`));
  const caseOptions = data.cases.map((item) => option(item.id, `${stringOf(item.title)} · ${formatEnumLabel(stringOf(item.status))}`));
  const linkedOptions = [
    ...data.mpoProjects.map((item) => option(`MPO_PROJECT:${stringOf(item.id)}`, `MPO · ${stringOf(item.title)}`)),
    ...data.ctoProjects.map((item) => option(`CTO_PROJECT:${stringOf(item.id)}`, `CTO · ${stringOf(item.title)}`)),
    ...data.scoPurchaseRequests.map((item) => option(`SCO_PURCHASE:${stringOf(item.id)}`, `SCO · ${stringOf(item.title)}`)),
  ];

  return [
    {
      id: "cases",
      label: "Dossiers juridiques",
      description: "Dossiers LA transversaux: type, demandeur, responsable juridique, risque, priorité, échéance, décision et arbitrage CEO.",
      endpoint: "/api/admin/la/cases",
      fields: [
        { name: "title", label: "Titre du dossier", type: "text", required: true },
        selectField("caseType", "Type de dossier", ["CLIENT_CONTRACT", "SUPPLIER_CONTRACT", "CONSULTING_CONTRACT", "EMPLOYMENT_CONTRACT", "AGREEMENT", "PARTNERSHIP", "NDA", "ADMINISTRATIVE_DOCUMENT", "DISPUTE", "COMPLIANCE", "SENSITIVE_DATA", "INTELLECTUAL_PROPERTY", "PROJECT_LEGAL_RISK", "TECHNICAL_LEGAL_RISK", "OTHER"]),
        { name: "requesterDepartmentId", label: "Département demandeur", type: "select", options: departmentOptions },
        { name: "requesterEmployeeId", label: "Demandeur", type: "select", options: employeeOptions },
        { name: "responsibleLegalId", label: "Responsable juridique", type: "select", options: employeeOptions },
        { name: "subject", label: "Objet", type: "text" },
        selectField("riskLevel", "Niveau de risque", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        selectField("priority", "Priorité", ["LOW", "NORMAL", "HIGH", "CRITICAL"]),
        selectField("status", "Statut", laStatus.cases),
        { name: "dueDate", label: "Échéance", type: "date" },
        { name: "linkedEntityType", label: "Type d'élément lié", type: "text", placeholder: "Projet, contrat, fournisseur..." },
        { name: "linkedEntityId", label: "Élément lié", type: "select", options: linkedOptions },
        { name: "attachmentUrl", label: "Pièce jointe", type: "file" },
        { name: "ceoValidationRequired", label: "Validation CEO requise", type: "select", options: [{ value: "false", label: "Non" }, { value: "true", label: "Oui" }] },
        { name: "description", label: "Description", type: "textarea" },
        { name: "legalDecision", label: "Décision juridique", type: "textarea" },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ],
      statusOptions: statusOptions(laStatus.cases),
      records: data.cases.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${formatEnumLabel(stringOf(item.caseType))} · ${stringOf(item.requesterDepartmentName)}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.legalDecision || item.comments || item.description),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([formatEnumLabel(stringOf(item.priority)), `Risque: ${formatEnumLabel(stringOf(item.riskLevel))}`, stringOf(item.responsibleLegalName), formatDate(item.dueDate), stringOf(item.ceoValidationRequired) === "true" ? "CEO requis" : ""]),
        href: stringOrNull(item.attachmentUrl),
        hrefLabel: "Ouvrir la pièce jointe",
        values: fieldValues(item, ["title", "caseType", "requesterDepartmentId", "requesterEmployeeId", "responsibleLegalId", "subject", "description", "riskLevel", "priority", "status", "dueDate", "linkedEntityType", "linkedEntityId", "attachmentUrl", "legalDecision", "ceoValidationRequired", "comments"]),
      })),
    },
    {
      id: "contracts",
      label: "Contrats & conventions",
      description: "Contrats clients, fournisseurs, RH, consultance, conventions et validations LA/CEO liées aux sections métier.",
      endpoint: "/api/admin/la/contracts",
      fields: [
        { name: "title", label: "Titre du contrat", type: "text", required: true },
        selectField("contractType", "Type de contrat", ["SERVICE_CONTRACT", "CONSULTING_CONTRACT", "PARTNERSHIP_AGREEMENT", "NDA", "OFFICIAL_LETTER", "MANDATE", "MOU", "DATA_PROTECTION_CLAUSE", "IP_CLAUSE", "INTERNAL_CONFIDENTIALITY", "TERMINATION_CLAUSE", "SUPPLIER_CONTRACT", "EMPLOYMENT_CONTRACT", "OTHER"]),
        { name: "counterparty", label: "Partie concernée", type: "text" },
        { name: "requesterDepartmentId", label: "Département demandeur", type: "select", options: departmentOptions },
        { name: "internalResponsibleId", label: "Responsable interne", type: "select", options: employeeOptions },
        { name: "startDate", label: "Date de début", type: "date" },
        { name: "endDate", label: "Date de fin", type: "date" },
        { name: "duration", label: "Durée", type: "text" },
        { name: "amount", label: "Montant", type: "number" },
        { name: "currency", label: "Devise", type: "text" },
        selectField("status", "Statut", laStatus.contracts),
        { name: "version", label: "Version", type: "text" },
        { name: "documentUrl", label: "Document joint", type: "file" },
        { name: "legalCaseId", label: "Dossier juridique lié", type: "select", options: caseOptions },
        { name: "ceoValidationRequired", label: "Validation CEO nécessaire", type: "select", options: [{ value: "false", label: "Non" }, { value: "true", label: "Oui" }] },
        { name: "legalValidation", label: "Validation LA", type: "textarea" },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ],
      statusOptions: statusOptions(laStatus.contracts),
      records: data.contracts.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${formatEnumLabel(stringOf(item.contractType))} · ${stringOf(item.counterparty)}`,
        status: stringOf(item.status),
        amount: numberOf(item.amount),
        currency: stringOf(item.currency) || "USD",
        notes: stringOrNull(item.legalValidation || item.comments),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([stringOf(item.internalResponsibleName), formatDate(item.endDate), stringOf(item.version) ? `Version ${stringOf(item.version)}` : "", stringOf(item.ceoValidationRequired) === "true" ? "CEO requis" : ""]),
        href: stringOrNull(item.documentUrl),
        hrefLabel: "Ouvrir le contrat",
        values: fieldValues(item, ["title", "contractType", "counterparty", "requesterDepartmentId", "internalResponsibleId", "startDate", "endDate", "duration", "amount", "currency", "status", "version", "documentUrl", "legalCaseId", "legalValidation", "ceoValidationRequired", "comments"]),
      })),
    },
    {
      id: "templates",
      label: "Modèles juridiques",
      description: "Référentiel de clauses, contrats, lettres, mandats, NDA et modèles validés pour DTSC.",
      endpoint: "/api/admin/la/templates",
      fields: [
        { name: "name", label: "Nom du modèle", type: "text", required: true },
        selectField("templateType", "Type de document", ["SERVICE_CONTRACT_TEMPLATE", "CONSULTING_CONTRACT_TEMPLATE", "PARTNERSHIP_AGREEMENT_TEMPLATE", "NDA_TEMPLATE", "OFFICIAL_LETTER_TEMPLATE", "MANDATE_TEMPLATE", "MOU_TEMPLATE", "DATA_PROTECTION_CLAUSE", "IP_CLAUSE", "INTERNAL_CONFIDENTIALITY_CLAUSE", "TERMINATION_CLAUSE", "SUPPLIER_CONTRACT_TEMPLATE"]),
        { name: "version", label: "Version", type: "text" },
        selectField("status", "Statut", laStatus.templates),
        { name: "authorId", label: "Auteur", type: "select", options: employeeOptions },
        { name: "description", label: "Description", type: "textarea" },
        { name: "content", label: "Contenu du modèle", type: "textarea" },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ],
      statusOptions: statusOptions(laStatus.templates),
      records: data.templates.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.name),
        subtitle: `${formatEnumLabel(stringOf(item.templateType))} · ${stringOf(item.version)}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.comments || item.description || item.content),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([stringOf(item.authorName), stringOf(item.version)]),
        values: fieldValues(item, ["name", "templateType", "description", "content", "version", "status", "authorId", "comments"]),
      })),
    },
    {
      id: "risks",
      label: "Risques juridiques & conformité",
      description: "Suivi des risques, impacts, probabilités, mesures correctives, responsables et escalades CEO.",
      endpoint: "/api/admin/la/risks",
      fields: [
        { name: "title", label: "Titre du risque", type: "text", required: true },
        { name: "source", label: "Source du risque", type: "text" },
        { name: "departmentId", label: "Département concerné", type: "select", options: departmentOptions },
        { name: "linkedEntityType", label: "Type d'élément lié", type: "text" },
        { name: "linkedEntityId", label: "Élément lié", type: "select", options: linkedOptions },
        selectField("probability", "Probabilité", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        selectField("riskLevel", "Niveau de risque", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        { name: "responsibleEmployeeId", label: "Responsable", type: "select", options: employeeOptions },
        selectField("status", "Statut", laStatus.risks),
        { name: "dueDate", label: "Échéance", type: "date" },
        { name: "ceoEscalation", label: "Escalade CEO", type: "select", options: [{ value: "false", label: "Non" }, { value: "true", label: "Oui" }] },
        { name: "description", label: "Description", type: "textarea" },
        { name: "potentialImpact", label: "Impact potentiel", type: "textarea" },
        { name: "correctiveMeasure", label: "Mesure corrective", type: "textarea" },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ],
      statusOptions: statusOptions(laStatus.risks),
      records: data.risks.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${stringOf(item.departmentName)} · ${stringOf(item.source)}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.correctiveMeasure || item.potentialImpact || item.description),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([`Risque: ${formatEnumLabel(stringOf(item.riskLevel))}`, `Probabilité: ${formatEnumLabel(stringOf(item.probability))}`, stringOf(item.responsibleName), formatDate(item.dueDate), stringOf(item.ceoEscalation) === "true" ? "Escalade CEO" : ""]),
        values: fieldValues(item, ["title", "source", "departmentId", "linkedEntityType", "linkedEntityId", "description", "potentialImpact", "probability", "riskLevel", "correctiveMeasure", "responsibleEmployeeId", "status", "dueDate", "ceoEscalation", "comments"]),
      })),
    },
    {
      id: "documents",
      label: "Documents officiels & archivage",
      description: "Archivage sécurisé des statuts, RCCM, contrats signés, procès-verbaux, documents fiscaux, sociaux et conformité.",
      endpoint: "/api/admin/la/documents",
      fields: [
        { name: "title", label: "Titre du document", type: "text", required: true },
        selectField("documentType", "Type de document", ["STATUTES", "RCCM", "ADMINISTRATIVE_DOCUMENT", "SIGNED_CONTRACT", "AGREEMENT", "MANDATE", "OFFICIAL_LETTER", "MINUTES", "AUTHORIZATION", "TAX_SOCIAL_DOCUMENT", "COMPLIANCE_DOCUMENT", "INSTITUTIONAL_LETTER"]),
        { name: "reference", label: "Référence", type: "text" },
        { name: "documentDate", label: "Date du document", type: "date" },
        { name: "expirationDate", label: "Expiration", type: "date" },
        { name: "requesterDepartmentId", label: "Département concerné", type: "select", options: departmentOptions },
        { name: "legalCaseId", label: "Dossier lié", type: "select", options: caseOptions },
        { name: "fileUrl", label: "Fichier joint", type: "file" },
        selectField("status", "Statut", laStatus.documents),
        selectField("confidentialityLevel", "Confidentialité", ["INTERNAL_PUBLIC", "CONFIDENTIAL", "VERY_CONFIDENTIAL", "CEO_ONLY", "LA_CEO_ONLY"]),
        { name: "comments", label: "Commentaires", type: "textarea" },
      ],
      statusOptions: statusOptions(laStatus.documents),
      records: data.documents.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${formatEnumLabel(stringOf(item.documentType))} · ${stringOf(item.reference)}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.comments),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([formatEnumLabel(stringOf(item.confidentialityLevel)), stringOf(item.requesterDepartmentName), formatDate(item.expirationDate)]),
        href: stringOrNull(item.fileUrl),
        hrefLabel: "Ouvrir le document",
        values: fieldValues(item, ["title", "documentType", "reference", "documentDate", "expirationDate", "requesterDepartmentId", "legalCaseId", "fileUrl", "status", "confidentialityLevel", "comments"]),
      })),
    },
    {
      id: "disputes",
      label: "Litiges & réclamations",
      description: "Litiges clients, fournisseurs, collaborateurs, partenaires, administrations, technique ou financier.",
      endpoint: "/api/admin/la/disputes",
      fields: [
        { name: "title", label: "Titre du litige", type: "text", required: true },
        { name: "counterparty", label: "Partie concernée", type: "text" },
        selectField("disputeType", "Type de litige", ["CLIENT", "SUPPLIER", "EMPLOYEE", "PARTNER", "ADMINISTRATION", "TECHNICAL", "FINANCIAL", "OTHER"]),
        { name: "departmentId", label: "Département", type: "select", options: departmentOptions },
        { name: "potentialAmount", label: "Montant potentiel", type: "number" },
        { name: "currency", label: "Devise", type: "text" },
        selectField("riskLevel", "Niveau de risque", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        { name: "followUpResponsibleId", label: "Responsable du suivi", type: "select", options: employeeOptions },
        selectField("status", "Statut", laStatus.disputes),
        { name: "dueDate", label: "Date limite", type: "date" },
        { name: "documentUrl", label: "Documents associés", type: "file" },
        { name: "description", label: "Description", type: "textarea" },
        { name: "nextAction", label: "Prochaine action", type: "textarea" },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ],
      statusOptions: statusOptions(laStatus.disputes),
      records: data.disputes.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${formatEnumLabel(stringOf(item.disputeType))} · ${stringOf(item.counterparty)}`,
        status: stringOf(item.status),
        amount: numberOf(item.potentialAmount),
        currency: stringOf(item.currency) || "USD",
        notes: stringOrNull(item.nextAction || item.comments || item.description),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([`Risque: ${formatEnumLabel(stringOf(item.riskLevel))}`, stringOf(item.followUpResponsibleName), formatDate(item.dueDate)]),
        href: stringOrNull(item.documentUrl),
        hrefLabel: "Ouvrir les documents",
        values: fieldValues(item, ["title", "counterparty", "disputeType", "departmentId", "description", "potentialAmount", "currency", "riskLevel", "followUpResponsibleId", "status", "nextAction", "dueDate", "documentUrl", "comments"]),
      })),
    },
    {
      id: "requests",
      label: "Demandes juridiques internes",
      description: "Demandes HR & CFO, COO, CTO, MPO, SCO et CEO vers LA: avis, validation, contrat, conformité ou litige.",
      endpoint: "/api/admin/la/requests",
      fields: [
        { name: "subject", label: "Objet de la demande", type: "text", required: true },
        { name: "requesterDepartmentId", label: "Département demandeur", type: "select", options: departmentOptions },
        { name: "requesterEmployeeId", label: "Demandeur", type: "select", options: employeeOptions },
        selectField("requestType", "Type de demande", ["HR_CONTRACT", "FINANCIAL_COMMITMENT", "OPERATIONAL_RISK", "PROJECT_CONTRACT", "NDA", "IP_DATA", "TECH_LICENSE", "SUPPLIER_CONTRACT", "DISPUTE", "OFFICIAL_NOTE", "OTHER"]),
        selectField("priority", "Priorité", ["LOW", "NORMAL", "HIGH", "CRITICAL"]),
        { name: "desiredDueDate", label: "Date limite souhaitée", type: "date" },
        { name: "documentUrl", label: "Document joint", type: "file" },
        { name: "linkedEntityType", label: "Type d'élément lié", type: "text" },
        { name: "linkedEntityId", label: "Élément lié", type: "select", options: linkedOptions },
        selectField("status", "Statut", laStatus.requests),
        { name: "description", label: "Description", type: "textarea" },
        { name: "legalResponse", label: "Réponse LA", type: "textarea" },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ],
      statusOptions: statusOptions(laStatus.requests),
      records: data.requests.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.subject),
        subtitle: `${formatEnumLabel(stringOf(item.requestType))} · ${stringOf(item.requesterDepartmentName)}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.legalResponse || item.comments || item.description),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([formatEnumLabel(stringOf(item.priority)), stringOf(item.requesterName), formatDate(item.desiredDueDate)]),
        href: stringOrNull(item.documentUrl),
        hrefLabel: "Ouvrir le document",
        values: fieldValues(item, ["subject", "requesterDepartmentId", "requesterEmployeeId", "requestType", "description", "priority", "desiredDueDate", "documentUrl", "linkedEntityType", "linkedEntityId", "status", "legalResponse", "comments"]),
      })),
    },
    {
      id: "reports",
      label: "Rapports juridiques",
      description: "Rapports hebdomadaires, mensuels, contrats, risques, litiges, échéances et demandes par département.",
      endpoint: "/api/admin/la/reports",
      fields: [
        { name: "title", label: "Titre du rapport", type: "text", required: true },
        selectField("reportType", "Type de rapport", ["WEEKLY_LA", "MONTHLY_LA", "CONTRACTS", "LEGAL_RISKS", "DISPUTES", "EXPIRING_DOCUMENTS", "REQUESTS_BY_DEPARTMENT"]),
        { name: "periodStart", label: "Début période", type: "date" },
        { name: "periodEnd", label: "Fin période", type: "date" },
        { name: "departmentId", label: "Département", type: "select", options: departmentOptions },
        { name: "responsibleLegalId", label: "Responsable LA", type: "select", options: employeeOptions },
        selectField("status", "Statut", laStatus.reports),
        selectField("priority", "Priorité", ["LOW", "NORMAL", "HIGH", "CRITICAL"]),
        { name: "content", label: "Contenu", type: "textarea" },
        { name: "recommendations", label: "Recommandations", type: "textarea" },
        { name: "attachmentUrl", label: "Pièce jointe", type: "file" },
      ],
      statusOptions: statusOptions(laStatus.reports),
      records: data.reports.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${formatEnumLabel(stringOf(item.reportType))} · ${stringOf(item.departmentName)}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.recommendations || item.content),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([formatEnumLabel(stringOf(item.priority)), stringOf(item.responsibleLegalName), formatDate(item.periodEnd)]),
        href: stringOrNull(item.attachmentUrl),
        hrefLabel: "Ouvrir la pièce jointe",
        values: fieldValues(item, ["title", "reportType", "periodStart", "periodEnd", "departmentId", "responsibleLegalId", "status", "priority", "content", "recommendations", "attachmentUrl"]),
      })),
    },
  ];
}

export function buildCooDatasets(data: {
  operations: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  recurringTasks: Array<Record<string, unknown>>;
  departmentRequests: Array<Record<string, unknown>>;
  blockers: Array<Record<string, unknown>>;
  meetings: Array<Record<string, unknown>>;
  workflows: Array<Record<string, unknown>>;
  reports: Array<Record<string, unknown>>;
  departments: Array<Record<string, unknown>>;
  employees: Array<Record<string, unknown>>;
}): OperationDataset[] {
  const activeDepartments = data.departments.filter((item) => stringOf(item.status) === "ACTIVE");
  const activeEmployees = data.employees.filter((employee) => stringOf(employee.status) !== "EXITED");
  const departmentOptions = activeDepartments.map((department) => option(department.id, stringOf(department.name)));
  const employeeOptions = activeEmployees.map((employee) => option(employee.id, `${stringOf(employee.fullName)} · ${stringOf(employee.email)}`));
  const operationOptions = data.operations.map((operation) => option(operation.id, stringOf(operation.title)));
  const taskOptions = data.tasks.map((task) => option(task.id, stringOf(task.title)));

  return [
    {
      id: "operations",
      label: "Opérations internes",
      description: "Activités transversales entre départements: objectifs, livrables, responsable, progression et priorités.",
      endpoint: "/api/admin/coo/operations",
      fields: [
        { name: "title", label: "Titre", type: "text", required: true },
        { name: "pilotDepartmentId", label: "Département pilote", type: "select", required: true, options: departmentOptions },
        { name: "leadEmployeeId", label: "Responsable principal", type: "select", required: true, options: employeeOptions },
        { name: "involvedDepartments", label: "Départements impliqués", type: "text", placeholder: "Commercial, Tech, HR & CFO..." },
        { name: "collaborators", label: "Collaborateurs impliqués", type: "text" },
        selectField("priority", "Priorité", ["LOW", "NORMAL", "HIGH", "CRITICAL"]),
        selectField("status", "Statut", cooStatus.operations),
        { name: "startDate", label: "Date de début", type: "date" },
        { name: "dueDate", label: "Date limite", type: "date" },
        { name: "progress", label: "Progression %", type: "number" },
        { name: "description", label: "Description", type: "textarea" },
        { name: "objectives", label: "Objectifs attendus", type: "textarea" },
        { name: "deliverables", label: "Livrables attendus", type: "textarea" },
        { name: "attachmentUrl", label: "Pièce jointe", type: "file" },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ],
      statusOptions: statusOptions(cooStatus.operations),
      records: data.operations.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${stringOf(item.pilotDepartmentName)} · ${stringOf(item.leadEmployeeName)}`,
        status: stringOf(item.status),
        amount: numberOf(item.progress),
        currency: "%",
        notes: stringOrNull(item.comments || item.description),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([formatEnumLabel(stringOf(item.priority)), formatDate(item.dueDate), stringOf(item.involvedDepartments)]),
        values: fieldValues(item, ["title", "description", "pilotDepartmentId", "leadEmployeeId", "involvedDepartments", "collaborators", "priority", "status", "startDate", "dueDate", "progress", "objectives", "deliverables", "attachmentUrl", "comments"]),
      })),
    },
    {
      id: "tasks",
      label: "Tâches journalières",
      description: "Distribution, suivi, validation, blocage et preuve d'exécution des tâches quotidiennes.",
      endpoint: "/api/admin/coo/tasks",
      fields: [
        { name: "title", label: "Tâche", type: "text", required: true },
        selectField("taskType", "Type de tâche", ["ADMINISTRATIVE", "COMMERCIAL", "TECHNICAL", "FINANCIAL", "LEGAL", "HR", "CLIENT_SUPPORT", "MARKETING", "REPORTING", "MEETING", "CLIENT_FOLLOW_UP", "DELIVERY", "OTHER"]),
        { name: "operationId", label: "Opération liée", type: "select", options: operationOptions },
        { name: "departmentId", label: "Département", type: "select", required: true, options: departmentOptions },
        { name: "responsibleEmployeeId", label: "Responsable", type: "select", required: true, options: employeeOptions },
        { name: "assigneeEmployeeId", label: "Assigné à", type: "select", required: true, options: employeeOptions },
        { name: "plannedDate", label: "Date prévue", type: "date" },
        { name: "plannedStartTime", label: "Heure début", type: "text", placeholder: "08:30" },
        { name: "deadlineTime", label: "Heure limite", type: "text", placeholder: "17:00" },
        selectField("priority", "Priorité", ["LOW", "NORMAL", "HIGH", "CRITICAL"]),
        selectField("status", "Statut", cooStatus.tasks),
        { name: "progress", label: "Avancement %", type: "number" },
        { name: "description", label: "Instructions", type: "textarea" },
        { name: "managerComment", label: "Commentaire responsable", type: "textarea" },
        { name: "assigneeComment", label: "Commentaire exécutant", type: "textarea" },
        { name: "proofUrl", label: "Preuve / livrable", type: "file" },
        { name: "lateReason", label: "Raison du retard", type: "textarea" },
        { name: "blockerReason", label: "Raison du blocage", type: "textarea" },
      ],
      statusOptions: statusOptions(cooStatus.tasks),
      records: data.tasks.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${stringOf(item.departmentName)} · ${stringOf(item.assigneeName)}`,
        status: stringOf(item.status),
        amount: numberOf(item.progress),
        currency: "%",
        notes: stringOrNull(item.description || item.managerComment),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([formatEnumLabel(stringOf(item.priority)), formatEnumLabel(stringOf(item.taskType)), formatDate(item.plannedDate), stringOf(item.responsibleName)]),
        values: fieldValues(item, ["title", "taskType", "operationId", "departmentId", "responsibleEmployeeId", "assigneeEmployeeId", "plannedDate", "plannedStartTime", "deadlineTime", "priority", "status", "progress", "description", "managerComment", "assigneeComment", "proofUrl", "lateReason", "blockerReason"]),
      })),
    },
    {
      id: "recurringTasks",
      label: "Tâches récurrentes",
      description: "Modèles de tâches quotidiennes, hebdomadaires ou mensuelles à générer sans doublons.",
      endpoint: "/api/admin/coo/recurringTasks",
      fields: [
        { name: "title", label: "Modèle", type: "text", required: true },
        selectField("frequency", "Fréquence", ["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]),
        { name: "daysOfWeek", label: "Jours concernés", type: "text" },
        { name: "startDate", label: "Début", type: "date" },
        { name: "endDate", label: "Fin optionnelle", type: "date" },
        { name: "deadlineTime", label: "Heure limite", type: "text" },
        { name: "departmentId", label: "Département", type: "select", required: true, options: departmentOptions },
        { name: "responsibleEmployeeId", label: "Responsable", type: "select", required: true, options: employeeOptions },
        { name: "assigneeEmployeeId", label: "Assigné à", type: "select", required: true, options: employeeOptions },
        selectField("status", "Statut", cooStatus.recurringTasks),
        { name: "taskTemplate", label: "Modèle de tâche", type: "textarea", required: true },
      ],
      statusOptions: statusOptions(cooStatus.recurringTasks),
      records: data.recurringTasks.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${formatEnumLabel(stringOf(item.frequency))} · ${stringOf(item.assigneeName)}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.taskTemplate),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([stringOf(item.departmentName), stringOf(item.deadlineTime)]),
        values: fieldValues(item, ["title", "frequency", "daysOfWeek", "startDate", "endDate", "deadlineTime", "departmentId", "responsibleEmployeeId", "assigneeEmployeeId", "status", "taskTemplate"]),
      })),
    },
    {
      id: "departmentRequests",
      label: "Coordination inter-départements",
      description: "Demandes, dépendances, validations et réponses attendues entre départements DTSC.",
      endpoint: "/api/admin/coo/departmentRequests",
      fields: [
        { name: "requesterDepartmentId", label: "Département demandeur", type: "select", required: true, options: departmentOptions },
        { name: "targetDepartmentId", label: "Département destinataire", type: "select", required: true, options: departmentOptions },
        { name: "subject", label: "Objet", type: "text", required: true },
        { name: "requesterEmployeeId", label: "Responsable demandeur", type: "select", required: true, options: employeeOptions },
        { name: "targetResponsibleEmployeeId", label: "Responsable destinataire", type: "select", required: true, options: employeeOptions },
        selectField("priority", "Priorité", ["LOW", "NORMAL", "HIGH", "CRITICAL"]),
        selectField("status", "Statut", cooStatus.departmentRequests),
        { name: "requestedAt", label: "Date demande", type: "date" },
        { name: "dueDate", label: "Date limite", type: "date" },
        { name: "taskId", label: "Tâche liée", type: "select", options: taskOptions },
        { name: "operationId", label: "Opération liée", type: "select", options: operationOptions },
        { name: "description", label: "Description", type: "textarea" },
        { name: "expectedResponse", label: "Réponse attendue", type: "textarea" },
        { name: "comment", label: "Commentaire", type: "textarea" },
      ],
      statusOptions: statusOptions(cooStatus.departmentRequests),
      records: data.departmentRequests.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.subject),
        subtitle: `${stringOf(item.requesterDepartmentName)} → ${stringOf(item.targetDepartmentName)}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.comment || item.description),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([formatEnumLabel(stringOf(item.priority)), stringOf(item.targetResponsibleName), formatDate(item.dueDate)]),
        values: fieldValues(item, ["requesterDepartmentId", "targetDepartmentId", "subject", "requesterEmployeeId", "targetResponsibleEmployeeId", "priority", "status", "requestedAt", "dueDate", "taskId", "operationId", "description", "expectedResponse", "comment"]),
      })),
    },
    {
      id: "blockers",
      label: "Suivi des blocages",
      description: "Blocages opérationnels, criticité, impact, action corrective et résolution.",
      endpoint: "/api/admin/coo/blockers",
      fields: [
        { name: "title", label: "Blocage", type: "text", required: true },
        selectField("sourceType", "Source", ["TASK", "OPERATION", "DEPARTMENT_REQUEST", "HR", "FINANCE", "TECHNICAL", "INFORMATION", "VALIDATION_DELAY", "OTHER"]),
        { name: "taskId", label: "Tâche liée", type: "select", options: taskOptions },
        { name: "operationId", label: "Opération liée", type: "select", options: operationOptions },
        { name: "departmentId", label: "Département", type: "select", required: true, options: departmentOptions },
        { name: "responsibleEmployeeId", label: "Responsable", type: "select", required: true, options: employeeOptions },
        selectField("severity", "Criticité", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        selectField("status", "Statut", cooStatus.blockers),
        { name: "declaredAt", label: "Déclaré le", type: "date" },
        { name: "resolvedAt", label: "Résolu le", type: "date" },
        { name: "description", label: "Description", type: "textarea" },
        { name: "impact", label: "Impact", type: "textarea" },
        { name: "correctiveAction", label: "Action corrective", type: "textarea" },
        { name: "resolutionComment", label: "Commentaire résolution", type: "textarea" },
      ],
      statusOptions: statusOptions(cooStatus.blockers),
      records: data.blockers.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${stringOf(item.departmentName)} · ${stringOf(item.responsibleName)}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.description || item.resolutionComment),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([`Criticité: ${formatEnumLabel(stringOf(item.severity))}`, formatEnumLabel(stringOf(item.sourceType)), formatDate(item.resolvedAt)]),
        values: fieldValues(item, ["title", "sourceType", "taskId", "operationId", "departmentId", "responsibleEmployeeId", "severity", "status", "declaredAt", "resolvedAt", "description", "impact", "correctiveAction", "resolutionComment"]),
      })),
    },
    {
      id: "meetings",
      label: "Réunions et comptes rendus",
      description: "Planification, décisions, participants, tâches générées et comptes rendus.",
      endpoint: "/api/admin/coo/meetings",
      fields: [
        { name: "title", label: "Réunion", type: "text", required: true },
        selectField("meetingType", "Type", ["COORDINATION", "STRATEGIC", "OPERATIONAL", "FOLLOW_UP", "TECHNICAL", "FINANCIAL", "HR", "CLIENT", "OTHER"]),
        { name: "meetingDate", label: "Date", type: "date" },
        { name: "meetingTime", label: "Heure", type: "text" },
        { name: "departmentId", label: "Département", type: "select", options: departmentOptions },
        { name: "reportOwnerEmployeeId", label: "Responsable CR", type: "select", required: true, options: employeeOptions },
        selectField("status", "Statut", cooStatus.meetings),
        { name: "participants", label: "Participants", type: "select-multiple", options: employeeOptions, helperText: "Maintenez Ctrl ou Cmd pour sélectionner plusieurs collaborateurs." },
        { name: "agenda", label: "Ordre du jour", type: "textarea" },
        { name: "decisions", label: "Décisions prises", type: "textarea" },
        { name: "generatedTasks", label: "Tâches générées", type: "textarea" },
        { name: "minutes", label: "Compte rendu", type: "textarea" },
        { name: "attachmentUrl", label: "Pièce jointe", type: "file" },
      ],
      statusOptions: statusOptions(cooStatus.meetings),
      records: data.meetings.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${formatEnumLabel(stringOf(item.meetingType))} · ${stringOf(item.departmentName)}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.minutes || item.decisions),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([formatDate(item.meetingDate), stringOf(item.meetingTime), stringOf(item.reportOwnerName)]),
        values: fieldValues(item, ["title", "meetingType", "meetingDate", "meetingTime", "departmentId", "reportOwnerEmployeeId", "status", "participants", "agenda", "decisions", "generatedTasks", "minutes", "attachmentUrl"]),
      })),
    },
    {
      id: "workflows",
      label: "Workflows opérationnels",
      description: "Processus internes répétables, étapes, responsables et délais.",
      endpoint: "/api/admin/coo/workflows",
      fields: [
        { name: "name", label: "Workflow", type: "text", required: true },
        { name: "departmentId", label: "Département responsable", type: "select", required: true, options: departmentOptions },
        selectField("status", "Statut", cooStatus.workflows),
        { name: "description", label: "Description", type: "textarea" },
        { name: "steps", label: "Étapes", type: "textarea", required: true },
        { name: "stepOwners", label: "Responsables par étape", type: "textarea" },
        { name: "stepDeadlines", label: "Délais par étape", type: "textarea" },
        { name: "shareEmployeeIds", label: "Partager avec", type: "select-multiple", options: employeeOptions, helperText: "Optionnel: partage le workflow aux collaborateurs sélectionnés." },
        { name: "shareInstruction", label: "Instruction de partage", type: "textarea" },
      ],
      statusOptions: statusOptions(cooStatus.workflows),
      records: data.workflows.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.name),
        subtitle: stringOf(item.departmentName),
        status: stringOf(item.status),
        notes: stringOrNull(item.description || item.steps),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([stringOf(item.stepOwners) ? "Responsables définis" : "", stringOf(item.stepDeadlines) ? "Délais cadrés" : "", stringOf(item.shareCount) ? `${stringOf(item.shareCount)} partage(s)` : ""]),
        values: fieldValues(item, ["name", "departmentId", "status", "description", "steps", "stepOwners", "stepDeadlines", "shareEmployeeIds", "shareInstruction"]),
      })),
    },
    {
      id: "reports",
      label: "Rapports opérationnels",
      description: "Rapports journaliers, hebdomadaires, mensuels, par département, collaborateur ou opération.",
      endpoint: "/api/admin/coo/reports",
      fields: [
        { name: "title", label: "Rapport", type: "text", required: true },
        selectField("reportType", "Type", ["DAILY", "WEEKLY", "MONTHLY", "DEPARTMENT", "EMPLOYEE", "OPERATION"]),
        { name: "periodStart", label: "Début période", type: "date" },
        { name: "periodEnd", label: "Fin période", type: "date" },
        { name: "departmentId", label: "Département", type: "select", options: departmentOptions },
        { name: "employeeId", label: "Collaborateur", type: "select", options: employeeOptions },
        { name: "recipientEmployeeId", label: "Destinataire", type: "select", options: employeeOptions },
        { name: "operationId", label: "Opération", type: "select", options: operationOptions },
        selectField("priority", "Priorité", ["LOW", "NORMAL", "HIGH", "CRITICAL"]),
        { name: "tasksCreated", label: "Tâches créées", type: "number" },
        { name: "tasksCompleted", label: "Tâches terminées", type: "number" },
        { name: "tasksValidated", label: "Tâches validées", type: "number" },
        { name: "tasksRejected", label: "Tâches rejetées", type: "number" },
        { name: "lateTasks", label: "Tâches en retard", type: "number" },
        { name: "blockersCount", label: "Blocages", type: "number" },
        { name: "executionRate", label: "Taux d'exécution %", type: "number" },
        selectField("status", "Statut", cooStatus.reports),
        { name: "content", label: "Contenu du rapport", type: "textarea" },
        { name: "mainBlockers", label: "Principaux blocages", type: "textarea" },
        { name: "recommendations", label: "Recommandations", type: "textarea" },
      ],
      statusOptions: statusOptions(cooStatus.reports),
      records: data.reports.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: formatEnumLabel(stringOf(item.reportType)),
        status: stringOf(item.status),
        amount: numberOf(item.executionRate),
        currency: "%",
        notes: stringOrNull(item.content || item.recommendations || item.mainBlockers),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([stringOf(item.departmentName), stringOf(item.employeeName), stringOf(item.recipientName) ? `À: ${stringOf(item.recipientName)}` : "", formatEnumLabel(stringOf(item.priority)), formatDate(item.periodEnd)]),
        values: fieldValues(item, ["title", "reportType", "periodStart", "periodEnd", "departmentId", "employeeId", "recipientEmployeeId", "operationId", "priority", "tasksCreated", "tasksCompleted", "tasksValidated", "tasksRejected", "lateTasks", "blockersCount", "executionRate", "status", "content", "mainBlockers", "recommendations"]),
      })),
    },
  ];
}

export function buildCeoDatasets(data: {
  objectives: Array<Record<string, unknown>>;
  supervisionLogs: Array<Record<string, unknown>>;
  departments: Array<Record<string, unknown>>;
  employees: Array<Record<string, unknown>>;
}): OperationDataset[] {
  const activeDepartments = data.departments.filter((item) => stringOf(item.status) === "ACTIVE");
  const departmentOptions = activeDepartments.map((department) => option(department.id, stringOf(department.name)));
  const employeeOptions = data.employees
    .filter((employee) => stringOf(employee.status) !== "EXITED")
    .map((employee) => option(employee.id, `${stringOf(employee.fullName)} · ${stringOf(employee.email)}`));

  return [
    {
      id: "objectives",
      label: "Suivi des objectifs",
      description: "Objectifs exécutifs DTSC par période, département, responsable, cible et progression.",
      endpoint: "/api/admin/ceo/objectives",
      fields: [
        { name: "title", label: "Objectif", type: "text", required: true },
        selectField("objectiveType", "Type d'objectif", ["FINANCIAL", "COMMERCIAL", "OPERATIONAL", "HR", "TECHNICAL", "MARKETING", "STRATEGIC"]),
        { name: "departmentId", label: "Département", type: "select", options: departmentOptions },
        { name: "responsibleEmployeeId", label: "Responsable", type: "select", options: employeeOptions },
        { name: "periodStart", label: "Début période", type: "date" },
        { name: "periodEnd", label: "Fin période", type: "date" },
        { name: "targetValue", label: "Cible", type: "number" },
        { name: "currentValue", label: "Valeur actuelle", type: "number" },
        { name: "progress", label: "Progression %", type: "number" },
        selectField("status", "Statut", ceoStatus.objectives),
        selectField("priority", "Priorité", ["LOW", "NORMAL", "HIGH", "CRITICAL"]),
        { name: "description", label: "Description", type: "textarea" },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ],
      statusOptions: statusOptions(ceoStatus.objectives),
      records: data.objectives.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${formatEnumLabel(stringOf(item.objectiveType))} · ${stringOf(item.departmentName)}`,
        status: stringOf(item.status),
        amount: numberOf(item.progress),
        currency: "%",
        notes: stringOrNull(item.comments || item.description),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([
          `Priorité: ${formatEnumLabel(stringOf(item.priority))}`,
          stringOf(item.responsibleName),
          formatDate(item.periodEnd),
          stringOf(item.targetValue) ? `Cible: ${stringOf(item.targetValue)}` : "",
        ]),
        values: fieldValues(item, ["title", "objectiveType", "departmentId", "responsibleEmployeeId", "periodStart", "periodEnd", "targetValue", "currentValue", "progress", "status", "priority", "description", "comments"]),
      })),
    },
    {
      id: "supervisionLogs",
      label: "Journal de supervision",
      description: "Observations, décisions, instructions, risques, opportunités et suivis exécutifs.",
      endpoint: "/api/admin/ceo/supervisionLogs",
      fields: [
        { name: "title", label: "Titre", type: "text", required: true },
        selectField("entryType", "Type d'entrée", ["OBSERVATION", "DECISION", "INSTRUCTION", "RISK", "OPPORTUNITY", "FOLLOW_UP", "VALIDATION", "OTHER"]),
        { name: "departmentId", label: "Département concerné", type: "select", options: departmentOptions },
        { name: "employeeId", label: "Collaborateur concerné", type: "select", options: employeeOptions },
        selectField("priority", "Priorité", ["LOW", "NORMAL", "HIGH", "CRITICAL"]),
        selectField("status", "Statut", ceoStatus.supervisionLogs),
        { name: "logDate", label: "Date", type: "date" },
        { name: "followUpResponsibleId", label: "Responsable suivi", type: "select", options: employeeOptions },
        { name: "description", label: "Description", type: "textarea" },
        { name: "expectedAction", label: "Action attendue", type: "textarea" },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ],
      statusOptions: statusOptions(ceoStatus.supervisionLogs),
      records: data.supervisionLogs.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.title),
        subtitle: `${formatEnumLabel(stringOf(item.entryType))} · ${stringOf(item.departmentName)}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.expectedAction || item.comments || item.description),
        createdAt: stringOf(item.logDate || item.createdAt),
        meta: compactStrings([
          `Priorité: ${formatEnumLabel(stringOf(item.priority))}`,
          stringOf(item.employeeName),
          stringOf(item.followUpResponsibleName) ? `Suivi: ${stringOf(item.followUpResponsibleName)}` : "",
        ]),
        values: fieldValues(item, ["title", "entryType", "departmentId", "employeeId", "priority", "status", "logDate", "followUpResponsibleId", "description", "expectedAction", "comments"]),
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

function budgetRemaining(item: Record<string, unknown>) {
  return (numberOf(item.amount) || 0) - (numberOf(item.spentAmount) || 0);
}

function formatDate(value: unknown) {
  if (!value) {
    return "";
  }
  return new Date(String(value)).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fieldValues(item: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(fields.map((field) => [field, formValue(item[field])]));
}

function formValue(value: unknown) {
  if (value == null) {
    return "";
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return text.slice(0, 10);
  }
  return text;
}
