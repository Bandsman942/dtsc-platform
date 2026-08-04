import fs from "node:fs";

function update(path, transforms) {
  const original = fs.readFileSync(path, "utf8");
  let content = original;
  for (const [from, to] of transforms) {
    if (!content.includes(from)) {
      throw new Error(`${path}: expected source fragment not found: ${from}`);
    }
    content = content.replace(from, to);
  }
  if (content !== original) fs.writeFileSync(path, content);
}

update("app/api/calendar/resources/reservations/route.ts", [
  ["async function getContext(req: Request)", "async function getContext()"],
  ["const auth = await getContext(req);", "const auth = await getContext();"],
  ["const auth = await getContext(req);", "const auth = await getContext();"],
]);

update("app/api/operations/sla/route.ts", [
  ["export async function POST(req: Request) {\n  const startedAt = Date.now();", "export async function POST(req: Request) {"],
]);

update("components/admin/dtsc-individual-permissions-panel.tsx", [
  ["Sélectionnez le collaborateur, l'acte autorisé, la durée et un motif professionnel.", "Sélectionnez le collaborateur, l’acte autorisé, la durée et un motif professionnel."],
]);

update("components/admin/operational-sla-panel.tsx", [
  ["Les politiques sont liées à des objets réels. L'évaluation calcule les états RUNNING, WARNING et BREACHED sans modifier le statut métier de l'objet.", "Les politiques sont liées à des objets réels. L’évaluation calcule les états RUNNING, WARNING et BREACHED sans modifier le statut métier de l’objet."],
]);

update("components/calendar/calendar-advanced-tools-panel.tsx", [
  ["Les fonctions locales restent disponibles. Les intégrations externes sont bloquées proprement lorsqu'aucun fournisseur n'est configuré.", "Les fonctions locales restent disponibles. Les intégrations externes sont bloquées proprement lorsqu’aucun fournisseur n’est configuré."],
  ["La synchronisation ne contourne jamais l'acceptation des participants ni les contrôles d'accès du calendrier interne.", "La synchronisation ne contourne jamais l’acceptation des participants ni les contrôles d’accès du calendrier interne."],
  ["Créez une ressource interne réservée à l'organisation active.", "Créez une ressource interne réservée à l’organisation active."],
]);

update("components/calendar/internal-calendar-workspace-v2.tsx", [
  ["CalendarCheck2, CalendarClock, Check, ChevronRight, Clock3, Filter", "CalendarCheck2, CalendarClock, Check, Filter"],
  ["Le créateur reste responsable de son événement. Les autres collaborateurs reçoivent une invitation et l'événement ne rejoint leur agenda qu'après acceptation.", "Le créateur reste responsable de son événement. Les autres collaborateurs reçoivent une invitation et l’événement ne rejoint leur agenda qu’après acceptation."],
  ["L'événement sera retiré des calendriers actifs. L'action reste traçable.", "L’événement sera retiré des calendriers actifs. L’action reste traçable."],
  ["Tant que vous n'acceptez pas, l'événement n'est pas ajouté à votre calendrier personnel.", "Tant que vous n’acceptez pas, l’événement n’est pas ajouté à votre calendrier personnel."],
  ["Chaque personne devra accepter avant que l'événement apparaisse dans son calendrier personnel.", "Chaque personne devra accepter avant que l’événement apparaisse dans son calendrier personnel."],
]);

update("components/enterprise/enterprise-activities-module.tsx", [
  ["dans l'entreprise active.", "dans l’entreprise active."],
]);

console.log("Iteration 04 lint fixes applied.");
