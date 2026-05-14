import { formatEnumLabel } from "@/lib/labels";
import type { OperationDataset, OperationField } from "@/lib/admin-operations-types";

const hrStatus = {
  employees: ["ACTIVE", "ONBOARDING", "ON_LEAVE", "SUSPENDED", "EXITED"],
  budgets: ["OPEN", "MONITORING", "OVER_BUDGET", "CLOSED"],
  transactions: ["DRAFT", "PENDING", "VALIDATED", "REJECTED", "CANCELED"],
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
  const staffOptions = data.staffUsers.map((user) => option(user.id, `${stringOf(user.name)} · ${formatEnumLabel(stringOf(user.role))} · ${stringOf(user.email)}`, user.email));
  const departmentOptions = activeDepartments.map((department) => option(department.id, stringOf(department.name)));
  const accountOptions = activeAccounts.map((account) => option(account.id, `${stringOf(account.name)} · ${formatEnumLabel(stringOf(account.accountType))}`));
  const budgetOptions = data.budgets
    .filter((budget) => ["OPEN", "MONITORING"].includes(stringOf(budget.status)) && budgetRemaining(budget) > 0)
    .map((budget) => option(budget.id, `${stringOf(budget.name)} · solde ${budgetRemaining(budget).toFixed(2)} USD`));
  const employeeOptions = data.employees
    .filter((employee) => stringOf(employee.status) !== "EXITED")
    .map((employee) => option(employee.id, `${stringOf(employee.fullName)} · ${stringOf(employee.email)}`));
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
      })),
    },
    {
      id: "employees",
      label: "Collaborateurs & dossiers RH",
      description: "Dossier RH lié aux membres internes existants. Le nom et l'email viennent du compte utilisateur et ne sont pas modifiés ici.",
      endpoint: "/api/admin/hr-cfo/employees",
      fields: [
        { name: "userId", label: "Collaborateur", type: "select", required: true, options: staffOptions, helperText: "Seuls les membres non-client actifs ou suspendus sont proposés." },
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
        { name: "accountId", label: "Compte", type: "select", required: true, options: accountOptions },
        { name: "departmentId", label: "Département", type: "select", options: departmentOptions },
        { name: "budgetId", label: "Budget concerné", type: "select", options: budgetOptions, helperText: "Obligatoire pour une sortie validée." },
        { name: "paymentMethod", label: "Moyen de paiement", type: "text", placeholder: "Espèces, banque, mobile money..." },
        { name: "attachmentUrl", label: "Pièce justificative", type: "text", placeholder: "Lien du justificatif" },
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
      })),
    },
    {
      id: "payrolls",
      label: "Gestion de la paie",
      description: "Paies par collaborateur, période, budget et compte. Une paie validée crée automatiquement une sortie financière.",
      endpoint: "/api/admin/hr-cfo/payrolls",
      fields: [
        { name: "employeeId", label: "Collaborateur", type: "select", required: true, options: employeeOptions },
        { name: "periodStart", label: "Début période", type: "date", required: true },
        { name: "periodEnd", label: "Fin période", type: "date", required: true },
        { name: "grossAmount", label: "Montant brut", type: "number", required: true },
        { name: "bonusAmount", label: "Primes", type: "number" },
        { name: "deductionAmount", label: "Retenues", type: "number" },
        { name: "accountId", label: "Compte de paiement", type: "select", required: true, options: accountOptions },
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
        meta: compactStrings([`Brut: ${(numberOf(item.grossAmount) || 0).toFixed(2)} USD`, stringOf(item.accountName), stringOf(item.budgetName)]),
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
