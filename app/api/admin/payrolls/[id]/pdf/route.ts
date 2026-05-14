import { requireAdminBlockAccess } from "@/lib/admin-api";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function GET(_req: Request, { params }: Params) {
  const { session, response } = await requireAdminBlockAccess("hrCfo");
  if (!session) {
    return response || new Response("Forbidden", { status: 403 });
  }

  const { id } = await params;
  const payroll = await prisma.hrcfoPayroll.findUnique({
    where: { id },
    include: {
      employee: true,
      account: true,
      budget: true,
      transaction: true,
    },
  });

  if (!payroll) {
    return new Response("Not found", { status: 404 });
  }

  const fullName = escapeHtml(payroll.employee.fullName);
  const jobTitle = escapeHtml(payroll.employee.jobTitle);
  const department = escapeHtml(payroll.employee.department);
  const period = `${payroll.periodStart.toLocaleDateString("fr-FR")} - ${payroll.periodEnd.toLocaleDateString("fr-FR")}`;
  const gross = Number(payroll.grossAmount).toFixed(2);
  const bonus = Number(payroll.bonusAmount).toFixed(2);
  const deduction = Number(payroll.deductionAmount).toFixed(2);
  const net = Number(payroll.netAmount).toFixed(2);
  const account = escapeHtml(payroll.account?.name || "Non renseigné");
  const budget = escapeHtml(payroll.budget?.name || "Non renseigné");
  const status = escapeHtml(payroll.status);
  const notes = escapeHtml(payroll.notes || "");

  const html = `<!doctype html>
  <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <title>Bulletin de paie - ${fullName}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #0f172a; background: #f8fafc; }
        .sheet { max-width: 920px; margin: 0 auto; background: #fff; border: 1px solid #dbeafe; border-radius: 22px; padding: 28px; box-shadow: 0 24px 70px rgba(0,23,54,.12); }
        .header { background: linear-gradient(135deg, #001736, #005f9e); color: white; padding: 28px; border-radius: 18px; }
        .brand { letter-spacing: .08em; text-transform: uppercase; font-weight: 800; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 18px; }
        .box { border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; background: #f8fafc; }
        table { width: 100%; border-collapse: collapse; margin-top: 28px; }
        th, td { border-bottom: 1px solid #e2e8f0; padding: 14px; text-align: left; }
        .net { font-size: 28px; font-weight: 900; color: #002b5b; }
        .muted { color: #64748b; }
        footer { margin-top: 32px; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
        .print-button { display: inline-flex; margin: 0 0 18px; border: 0; border-radius: 14px; background: #002b5b; color: white; padding: 12px 18px; font-weight: 800; cursor: pointer; box-shadow: 0 14px 36px rgba(0,43,91,.18); }
        @media print { button { display: none; } body { margin: 20px; } }
      </style>
    </head>
    <body>
      <button class="print-button" onclick="window.print()">Imprimer / télécharger le bulletin de paie en PDF</button>
      <main class="sheet">
        <div class="header">
          <p class="brand">DTSC - Data and Tech Solutions Consulting</p>
          <h1>Bulletin de paie</h1>
          <p>Période: ${escapeHtml(period)}</p>
        </div>
        <div class="grid">
          <div class="box"><strong>Collaborateur</strong><br />${fullName}<br /><span class="muted">${jobTitle} · ${department}</span></div>
          <div class="box"><strong>Statut</strong><br />${status}<br /><span class="muted">Compte: ${account}<br />Budget: ${budget}</span></div>
        </div>
        <table>
          <thead><tr><th>Élément</th><th>Montant USD</th></tr></thead>
          <tbody>
            <tr><td>Montant brut</td><td>${gross}</td></tr>
            <tr><td>Primes</td><td>${bonus}</td></tr>
            <tr><td>Retenues</td><td>${deduction}</td></tr>
          </tbody>
        </table>
        <p class="net">Net à payer: ${net} USD</p>
        ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ""}
        <footer>© 2026 DTSC — Data and Tech Solutions Consulting. Document confidentiel généré par DTSC Platform.</footer>
      </main>
    </body>
  </html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
