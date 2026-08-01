import { redirect } from "next/navigation";
import { EnterpriseIdentityAdminPanel } from "@/components/enterprise/identity-links/enterprise-identity-admin-panel";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { getDashboardUrl } from "@/lib/domains";
import { listOrganizationIdentityLinks } from "@/lib/enterprise/identity-links/service";
import {
  canAccessOrganizationAdministration,
  requireActiveOrganizationMembership,
} from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export default async function EnterpriseIdentityAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string }>;
}) {
  const user = await requireUser();
  const session = await getSession();
  const { link: focusedLinkId } = await searchParams;
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect(getDashboardUrl());

  const membership = await requireActiveOrganizationMembership(session, organizationId);
  if (!membership || !canAccessOrganizationAdministration(membership.role)) redirect(getDashboardUrl());

  const [links, parties, contacts, employees, suppliers, supplierContacts] = await Promise.all([
    listOrganizationIdentityLinks(organizationId),
    prisma.enterpriseBusinessParty.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      select: {
        id: true,
        partyType: true,
        legalName: true,
        displayName: true,
        primaryEmail: true,
      },
      orderBy: { legalName: "asc" },
      take: 100,
    }),
    prisma.enterpriseBusinessPartyContact.findMany({
      where: { status: "ACTIVE", archivedAt: null, businessParty: { organizationId, archivedAt: null } },
      select: {
        id: true,
        label: true,
        value: true,
        contactType: true,
        businessParty: { select: { legalName: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.enterpriseEmployee.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, displayName: true, workEmail: true, employeeNumber: true },
      orderBy: { displayName: "asc" },
      take: 100,
    }),
    prisma.enterpriseSupplier.findMany({
      where: { organizationId, archivedAt: null, supplierType: "PERSON" },
      select: { id: true, legalName: true, displayName: true, email: true },
      orderBy: { legalName: "asc" },
      take: 100,
    }),
    prisma.enterpriseSupplierContact.findMany({
      where: { organizationId },
      select: { id: true, name: true, email: true, supplier: { select: { legalName: true, displayName: true } } },
      orderBy: { name: "asc" },
      take: 100,
    }),
  ]);

  const targets = [
    ...parties.map((party) => ({
      value: party.id,
      kind: "businessPartyId" as const,
      label: `${party.displayName || party.legalName} · ${party.partyType === "PERSON" ? "Personne" : "Organisation"}`,
      suggestedName: party.displayName || party.legalName,
      suggestedEmail: party.primaryEmail || "",
    })),
    ...contacts.map((contact) => ({
      value: contact.id,
      kind: "businessPartyContactId" as const,
      label: `${contact.label || contact.value} · Contact de ${contact.businessParty.displayName || contact.businessParty.legalName}`,
      suggestedName: contact.label || contact.businessParty.displayName || contact.businessParty.legalName,
      suggestedEmail: contact.contactType === "EMAIL" ? contact.value : "",
    })),
    ...suppliers.map((supplier) => ({
      value: supplier.id,
      kind: "supplierId" as const,
      label: `${supplier.displayName || supplier.legalName} · Fournisseur personne`,
      suggestedName: supplier.displayName || supplier.legalName,
      suggestedEmail: supplier.email || "",
    })),
    ...supplierContacts.map((contact) => ({
      value: contact.id,
      kind: "supplierContactId" as const,
      label: `${contact.name} · Contact de ${contact.supplier.displayName || contact.supplier.legalName}`,
      suggestedName: contact.name,
      suggestedEmail: contact.email || "",
    })),
    ...employees.map((employee) => ({
      value: employee.id,
      kind: "employeeId" as const,
      label: `${employee.displayName} · Employé ${employee.employeeNumber}`,
      suggestedName: employee.displayName,
      suggestedEmail: employee.workEmail || "",
    })),
  ];

  return (
    <AppShell user={user}>
      <EnterpriseIdentityAdminPanel
        organizationId={organizationId}
        organizationName={membership.organization.name}
        targets={targets}
        focusedLinkId={focusedLinkId}
        links={links.map((link) => ({
          id: link.id,
          requestedRelationType: link.requestedRelationType,
          requestedRoleCode: link.requestedRoleCode,
          status: link.status,
          purpose: link.purpose,
          revision: link.revision,
          createdAt: link.createdAt.toISOString(),
          person: link.person,
          references: link.references,
        }))}
      />
    </AppShell>
  );
}
