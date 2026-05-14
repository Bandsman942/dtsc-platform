import { getSession } from "@/lib/auth";
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
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: session.role === "ADMIN" ? { id } : { id, userId: session.userId },
    include: { user: true, payment: true, hrcfoTransaction: { include: { account: true, department: true, budget: true } } },
  });

  if (!invoice) {
    return new Response("Not found", { status: 404 });
  }

  const invoiceNumber = escapeHtml(invoice.number);
  const clientName = escapeHtml(invoice.user.name);
  const clientEmail = escapeHtml(invoice.user.email);
  const planName = escapeHtml(invoice.planName);
  const status = escapeHtml(invoice.status);
  const amount = `${Number(invoice.amount).toFixed(2)} ${escapeHtml(invoice.currency)}`;
  const paymentReference = escapeHtml(invoice.payment?.reference || "Non renseigné");
  const transactionLabel = escapeHtml(invoice.hrcfoTransaction?.title || invoice.planName);
  const accountName = escapeHtml(invoice.hrcfoTransaction?.account?.name || "Non renseigné");
  const departmentName = escapeHtml(invoice.hrcfoTransaction?.department?.name || "Non renseigné");
  const budgetName = escapeHtml(invoice.hrcfoTransaction?.budget?.name || "Non renseigné");
  const notes = escapeHtml(invoice.hrcfoTransaction?.notes || "");

  const html = `<!doctype html>
  <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <title>${invoiceNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #0f172a; background: #f8fafc; }
        .sheet { max-width: 920px; margin: 0 auto; background: white; border: 1px solid #dbeafe; border-radius: 22px; padding: 28px; box-shadow: 0 24px 70px rgba(0,23,54,.12); }
        .header { background: linear-gradient(135deg, #001736, #004b8d); color: white; padding: 28px; border-radius: 18px; }
        .brand { letter-spacing: .08em; text-transform: uppercase; font-weight: 800; }
        .muted { color: #64748b; }
        table { width: 100%; border-collapse: collapse; margin-top: 28px; }
        th, td { border-bottom: 1px solid #e2e8f0; padding: 14px; text-align: left; }
        .total { font-size: 24px; font-weight: 900; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 18px; }
        .box { border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; background: #f8fafc; }
        footer { margin-top: 32px; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
        .print-button { display: inline-flex; margin: 0 0 18px; border: 0; border-radius: 14px; background: #002b5b; color: white; padding: 12px 18px; font-weight: 800; cursor: pointer; box-shadow: 0 14px 36px rgba(0,43,91,.18); }
        @media print { button { display: none; } body { margin: 20px; } }
      </style>
    </head>
    <body>
      <button class="print-button" onclick="window.print()">Imprimer / télécharger la facture en PDF</button>
      <main class="sheet">
        <div class="header">
          <p class="brand">DTSC - Data and Tech Solutions Consulting</p>
          <h1>Facture ${invoiceNumber}</h1>
          <p>Le numérique au service de votre performance</p>
        </div>
        <div class="grid">
          <div class="box"><strong>Client / bénéficiaire</strong><br />${clientName}<br /><span class="muted">${clientEmail}</span></div>
          <div class="box"><strong>Date d'émission</strong><br />${invoice.issuedAt.toLocaleDateString("fr-FR")}<br /><span class="muted">Statut: ${status}</span></div>
        </div>
        <table>
          <thead><tr><th>Libellé</th><th>Compte</th><th>Département</th><th>Budget</th><th>Montant</th></tr></thead>
          <tbody><tr><td>${transactionLabel || planName}</td><td>${accountName}</td><td>${departmentName}</td><td>${budgetName}</td><td>${amount}</td></tr></tbody>
        </table>
        <p class="total">Total: ${amount}</p>
        <p class="muted">Paiement: ${paymentReference}</p>
        ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ""}
        <footer>© 2026 DTSC — Data and Tech Solutions Consulting. Document généré par DTSC Platform.</footer>
      </main>
    </body>
  </html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
