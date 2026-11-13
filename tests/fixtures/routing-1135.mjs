// Historical public paths, independently recorded for the consolidation contract.
const routes = (family, definitions) => definitions.map(([path, verbs]) => ({
  family, path, methods: verbs.split(" "),
}));
export const apiRoutes = [
  ...routes("gaming", [
    ["bookings", "GET POST"], ["bookings/[bookingId]", "PATCH"],
    ["checkouts", "GET POST"], ["checkouts/[checkoutId]", "GET PATCH"],
    ["checkouts/[checkoutId]/receipt", "GET"],
    ["daily-closes", "GET POST"], ["daily-closes/[closeId]", "GET PATCH"],
    ["dashboard", "GET"], ["onboarding", "GET POST"],
    ["pricing", "GET POST"], ["pricing/[ruleId]", "PATCH"], ["pricing/simulate", "POST"],
    ["reports", "GET POST"], ["sessions", "GET POST"], ["sessions/[sessionId]", "PATCH"],
    ["stations", "GET POST"], ["stations/[stationId]", "PATCH"], ["stations/candidates", "GET"],
    ["tournaments", "GET POST"], ["tournaments/[tournamentId]", "GET PATCH"],
    ["tournaments/[tournamentId]/registrations", "POST"],
    ["tournaments/[tournamentId]/registrations/[registrationId]", "PATCH"],
    ["tournaments/[tournamentId]/stations", "POST"],
    ["tournaments/[tournamentId]/stations/[assignmentId]", "PATCH"],
  ]),
  ...routes("insurance-connectors", [
    ["verify", "POST"], ["invoices", "GET POST"], ["invoices/status", "POST"],
    ["ocr", "GET POST"], ["ocr/status", "POST"],
  ]),
  ...routes("exports", [["audit", "GET"], ["organizations", "GET"], ["payments", "GET"], ["users", "GET"]]),
];
export const financeCodes = [
  "ACCOUNTING", "ASSETS", "BANK", "CASH", "CLOSE", "INVENTORY", "OVERVIEW",
  "PAYABLES", "PAYMENTS", "RECEIVABLES", "RECONCILIATION", "STATEMENTS", "TAX", "TREASURY",
].map(code => "FINANCE_" + code);

export function routeCase(route, organizationId = "routing-tenant-a") {
  const params = route.family === "exports" ? {} : { organizationId };
  const operation = route.path.split("/").map(segment => {
    if (!segment.startsWith("[")) return segment;
    const key = segment.slice(1, -1);
    return params[key] = "routing-" + key;
  });
  const prefix = route.family === "exports" ? "/api/admin/exports" : `/api/enterprise/${organizationId}/${route.family}`;
  return { params, operation, url: prefix + "/" + operation.join("/") };
}
