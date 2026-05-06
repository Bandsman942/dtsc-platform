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
    include: { user: true, payment: true },
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

  const html = `<!doctype html>
  <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <title>${invoiceNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #0f172a; }
        .header { background: #001736; color: white; padding: 28px; border-radius: 18px; }
        .muted { color: #64748b; }
        table { width: 100%; border-collapse: collapse; margin-top: 28px; }
        th, td { border-bottom: 1px solid #e2e8f0; padding: 14px; text-align: left; }
        .total { font-size: 24px; font-weight: 900; }
        @media print { button { display: none; } body { margin: 20px; } }
      </style>
    </head>
    <body>
      <button onclick="window.print()">Exporter en PDF</button>
      <div class="header">
        <p>DTSC - Data and Tech Solutions Consulting</p>
        <h1>Facture ${invoiceNumber}</h1>
      </div>
      <p><strong>Client:</strong> ${clientName} - ${clientEmail}</p>
      <p><strong>Date:</strong> ${invoice.issuedAt.toLocaleDateString("fr-FR")}</p>
      <table>
        <thead><tr><th>Plan</th><th>Statut</th><th>Montant</th></tr></thead>
        <tbody><tr><td>${planName}</td><td>${status}</td><td>${amount}</td></tr></tbody>
      </table>
      <p class="total">Total: ${amount}</p>
      <p class="muted">Paiement: ${paymentReference}</p>
    </body>
  </html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
