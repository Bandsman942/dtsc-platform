import { formatEnumLabel } from "@/lib/labels";
import type { OperationDataset, OperationField } from "@/lib/admin-operations-types";

const hrStatus = {
  employees: ["ACTIVE", "ONBOARDING", "ON_LEAVE", "SUSPENDED", "EXITED"],
  budgets: ["OPEN", "MONITORING", "OVER_BUDGET", "CLOSED"],
  transactions: ["DRAFT", "PENDING", "VALIDATED", "PAID", "REJECTED", "CANCELED"],
  payrolls: ["DRAFT", "VALIDATED", "PAID", "CANCELED"],
  references: ["ACTIVE", "INACTIVE"],
};

const scoStatus = {
  vendors: ["ACTIVE", "WATCHLIST", "SUSPENDED", "ARCHIVED"],
  purchaseRequests: ["DRAFT", "SUBMITTED", "APPROVED", "ORDERED", "RECEIVED", "REJECTED", "CANCELED"],
  inventory: ["AVAILABLE", "LOW_STOCK", "RESERVED", "OUT_OF_STOCK", "ARCHIVED"],
  assets: ["ASSIGNED", "AVAILABLE", "MAINTENANCE", "LOST", "RETIRED"],
  logistics: ["PLANNED", "READY", "IN_PROGRESS", "COMPLETED", "BLOCKED", "CANCELED"],
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
  staffUsers: Array<Record<string, unknown>>;
};

export function buildHrcfoDatasets(data: HrcfoData): OperationDataset[] {
  const activeDepartments = data.departments.filter((item) => stringOf(item.status) === "ACTIVE");
  const activeAccounts = data.accounts.filter((item) => stringOf(item.status) === "ACTIVE");
  const staffOptions = data.staffUsers.map((user) => option(user.id, `${stringOf(user.name)} · ${formatEnumLabel(stringOf(user.role))}`, user.email));
  const departmentOptions = activeDepartments.map((department) => option(department.id, stringOf(department.name)));
  const accountOptions = activeAccounts.map((account) => option(account.id, `${stringOf(account.name)} · ${formatEnumLabel(stringOf(account.accountType))}`));
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
      id: "employees",
      label: "Collaborateurs & dossiers RH",
      description: "Dossier RH lié aux membres internes existants. Le nom et l'email viennent du compte utilisateur et ne sont pas modifiés ici.",
      endpoint: "/api/admin/hr-cfo/employees",
      fields: [
        { name: "userId", label: "Collaborateur", type: "select", required: true, options: staffOptions, helperText: "Seuls les membres non-client actifs ou suspendus sont proposés." },
        { name: "userEmailPreview", label: "Email du collaborateur", type: "preview", previewFor: "userId", helperText: "Lecture seule: l'email vient du compte utilisateur sélectionné." },
        { name: "departmentId", label: "Département", type: "select", required: true, options: departmentOptions },
        { name: "jobTitle", label: "Poste", type: "text", required: true },
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
        subtitle: `${stringOf(item.jobTitle)} · ${stringOf(item.department)}`,
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
        values: fieldValues(item, ["userId", "departmentId", "jobTitle", "contractType", "status", "startDate", "monthlyCompensation", "managerUserId", "complianceStatus", "skills", "kpis", "notes"]),
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
        selectField("status", "Statut", ["ACTIVE", "INACTIVE", "ARCHIVED"]),
        { name: "description", label: "Description", type: "textarea" },
      ],
      statusOptions: statusOptions(["ACTIVE", "INACTIVE", "ARCHIVED"]),
      records: data.materialItems.map((item) => ({
        id: stringOf(item.id),
        title: stringOf(item.name),
        subtitle: `${formatEnumLabel(stringOf(item.itemType))} · ${stringOf(item.category)}`,
        status: stringOf(item.status),
        notes: stringOrNull(item.description),
        createdAt: stringOf(item.createdAt),
        meta: compactStrings([stringOf(item.sku), `Unité: ${stringOf(item.unit)}`]),
        values: fieldValues(item, ["name", "sku", "category", "itemType", "unit", "status", "description"]),
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
        values: fieldValues(item, ["name", "category", "contactName", "email", "phone", "paymentTerms", "reliabilityScore", "avgLeadTimeDays", "status", "notes"]),
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
        { name: "project", label: "Projet/mission", type: "text" },
        selectField("urgency", "Urgence", ["LOW", "MEDIUM", "HIGH", "URGENT"]),
        { name: "estimatedAmount", label: "Montant estimé", type: "number" },
        { name: "currency", label: "Devise", type: "text", placeholder: "USD" },
        selectField("status", "Statut", scoStatus.purchaseRequests),
        selectField("budgetStatus", "Budget", ["PENDING_REVIEW", "AVAILABLE", "INSUFFICIENT", "APPROVED"]),
        { name: "selectedVendorName", label: "Fournisseur retenu", type: "select", options: activeVendorOptions, helperText: "Liste issue du formulaire Fournisseurs." },
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
        meta: compactStrings([formatEnumLabel(stringOf(item.urgency)), `Budget: ${formatEnumLabel(stringOf(item.budgetStatus))}`, stringOf(item.selectedVendorName), formatDate(item.neededBy)]),
        values: fieldValues(item, ["title", "requesterName", "project", "urgency", "estimatedAmount", "currency", "status", "budgetStatus", "selectedVendorName", "neededBy", "justification", "notes"]),
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
        { name: "ownerName", label: "Responsable", type: "select", options: employeeNameOptions },
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
        values: fieldValues(item, ["materialItemId", "name", "sku", "category", "quantity", "minimumQuantity", "unit", "location", "ownerName", "status", "lastInventoryAt", "notes"]),
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
        { name: "assignedTo", label: "Assigné à", type: "select", options: employeeNameOptions },
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
        meta: compactStrings([`État: ${formatEnumLabel(stringOf(item.condition))}`, stringOf(item.assignedTo), formatDate(item.maintenanceDueAt)]),
        values: fieldValues(item, ["materialItemId", "tag", "name", "category", "assignedTo", "condition", "status", "purchaseDate", "maintenanceDueAt", "notes"]),
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
        meta: compactStrings([formatDate(item.eventDate), stringOf(item.transportPlan) ? "Transport cadré" : "", stringOf(item.equipmentChecklist) ? "Checklist prête" : ""]),
        values: fieldValues(item, ["title", "location", "eventDate", "ownerName", "status", "transportPlan", "equipmentChecklist", "riskNotes", "notes"]),
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
