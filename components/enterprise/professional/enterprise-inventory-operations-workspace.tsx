"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, ClipboardCheck, Eye, PackageSearch, Plus, Truck, XCircle } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalSearch,
  ProfessionalTabs,
  professionalMutation,
  useProfessionalCollection,
} from "@/components/enterprise/professional/professional-erp-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Member = { id: string; label: string; role: string; positionTitle: string | null };
type Warehouse = { id: string; code: string; name: string; siteId: string };
type Location = { id: string; code: string; name: string; warehouseId: string };
type InventoryChoice = { id: string; code: string; sku: string | null; name: string; minimumQuantity: string | number | null };
type Lookups = { members: Member[]; warehouses: Warehouse[]; locations: Location[]; inventoryItems: InventoryChoice[] };
type InventoryItem = {
  id: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  isLowStock: boolean;
  minimumQuantity: string | number | null;
  catalogItem: { id: string; code: string; sku: string | null; name: string; unitOfMeasure: { symbol: string } | null; category: { name: string } | null };
  balances: Array<{ id: string; quantityOnHand: string | number; quantityReserved: string | number; warehouse: { id: string; code: string; name: string }; storageLocation: { id: string; code: string; name: string } | null; stockLot: { id: string; lotNumber: string; expiryDate: string | null } | null }>;
};
type Transfer = {
  id: string;
  reference: string;
  status: string;
  revision: number;
  requestedAt: string;
  sourceWarehouse: { id: string; code: string; name: string };
  destinationWarehouse: { id: string; code: string; name: string };
  lines: Array<{ id: string; inventoryItemId: string; quantity: string | number; sourceLocationId: string | null; destinationLocationId: string | null }>;
};
type Count = {
  id: string;
  reference: string;
  status: string;
  countType: string;
  revision: number;
  scheduledAt: string | null;
  warehouse: { id: string; code: string; name: string };
  lines: Array<{ id: string; inventoryItemId: string; theoreticalQuantity: string | number; countedQuantity: string | number | null; varianceQuantity: string | number | null }>;
};

const INVENTORY_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  PENDING_APPROVAL: "En attente de validation",
  APPROVED: "Validé",
  REJECTED: "Refusé",
  IN_TRANSIT: "En transit",
  COMPLETED: "Clôturé",
  CANCELLED: "Annulé",
  OPEN: "Ouvert",
  COUNTING: "Comptage en cours",
  CLOSED: "Clôturé",
};
function statusTone(status: string) {
  if (["APPROVED", "COMPLETED", "CLOSED"].includes(status)) return "success" as const;
  if (["PENDING_APPROVAL", "IN_TRANSIT", "OPEN", "COUNTING"].includes(status)) return "warning" as const;
  if (["REJECTED", "CANCELLED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}
function quantity(value: string | number, symbol?: string | null) { return `${Number(value || 0).toLocaleString("fr-FR")} ${symbol || ""}`.trim(); }

export function EnterpriseInventoryOperationsWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const [tab, setTab] = useState("STOCK");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ members: [], warehouses: [], locations: [], inventoryItems: [] });
  const [transferOpen, setTransferOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [detail, setDetail] = useState<InventoryItem | Transfer | Count | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/operational-lookups?module=INVENTORY_LOGISTICS`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Lookups & { message?: string } | null;
        if (!response.ok || !body) throw new Error(body?.message || "Les sélecteurs de stock sont indisponibles.");
        if (active) setLookups({ members: body.members || [], warehouses: body.warehouses || [], locations: body.locations || [], inventoryItems: body.inventoryItems || [] });
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Les sélecteurs de stock sont indisponibles."); });
    return () => { active = false; };
  }, [organizationId, refreshKey]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "25" }); if (search.trim() && tab === "STOCK") value.set("search", search.trim()); if (status && tab !== "STOCK") value.set("status", status); return value; }, [page, search, status, tab]);
  const stock = useProfessionalCollection<InventoryItem>({ endpoint: `/api/enterprise/${organizationId}/inventory`, params, refreshKey });
  const transfers = useProfessionalCollection<Transfer>({ endpoint: `/api/enterprise/${organizationId}/stock-transfers`, params, refreshKey });
  const counts = useProfessionalCollection<Count>({ endpoint: `/api/enterprise/${organizationId}/inventory-counts`, params, refreshKey });
  const activeCollection = tab === "STOCK" ? stock : tab === "TRANSFERS" ? transfers : counts;

  async function createTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/stock-transfers`, {
        sourceWarehouseId: String(form.get("sourceWarehouseId") || ""),
        destinationWarehouseId: String(form.get("destinationWarehouseId") || ""),
        approverUserId: String(form.get("approverUserId") || ""),
        notes: String(form.get("notes") || "") || null,
        lines: [{ inventoryItemId: String(form.get("inventoryItemId") || ""), sourceLocationId: String(form.get("sourceLocationId") || "") || null, destinationLocationId: String(form.get("destinationLocationId") || "") || null, quantity: Number(form.get("quantity") || 0) }],
      });
      setTransferOpen(false); setTab("TRANSFERS"); setRefreshKey((value) => value + 1); setMessage("Le transfert a été soumis à un approbateur indépendant.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Le transfert n’a pas pu être créé."); }
  }

  async function createCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/inventory-counts`, {
        warehouseId: String(form.get("warehouseId") || ""), storageLocationId: String(form.get("storageLocationId") || "") || null,
        countType: String(form.get("countType") || "FULL"), approverUserId: String(form.get("approverUserId") || ""), notes: String(form.get("notes") || "") || null,
        lines: [{ inventoryItemId: String(form.get("inventoryItemId") || ""), countedQuantity: Number(form.get("countedQuantity") || 0), notes: String(form.get("lineNotes") || "") || null }],
      });
      setCountOpen(false); setTab("COUNTS"); setRefreshKey((value) => value + 1); setMessage("La campagne d’inventaire a été créée avec son premier comptage.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "L’inventaire n’a pas pu être créé."); }
  }

  async function createAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/stock-adjustments`, {
        inventoryItemId: String(form.get("inventoryItemId") || ""), warehouseId: String(form.get("warehouseId") || ""), storageLocationId: String(form.get("storageLocationId") || "") || null,
        adjustmentType: String(form.get("adjustmentType") || "IN"), quantity: Number(form.get("quantity") || 0), reason: String(form.get("reason") || ""), approverUserId: String(form.get("approverUserId") || ""), idempotencyKey: crypto.randomUUID(),
      });
      setAdjustOpen(false); setRefreshKey((value) => value + 1); setMessage("L’ajustement est en attente de validation contrôlée.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "L’ajustement n’a pas pu être créé."); }
  }

  async function decide(entity: Transfer | Count, decision: "APPROVE" | "REJECT") {
    const endpoint = "sourceWarehouse" in entity ? `stock-transfers/${entity.id}/decision` : `inventory-counts/${entity.id}/decision`;
    try { await professionalMutation(`/api/enterprise/${organizationId}/${endpoint}`, { decision, revision: entity.revision }); setDetail(null); setRefreshKey((value) => value + 1); setMessage(decision === "APPROVE" ? "L’opération a été validée." : "L’opération a été refusée."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "La décision n’a pas pu être enregistrée."); }
  }

  const transferActions = (item: Transfer): BusinessContextAction[] => [{ id: "open", label: "Ouvrir", icon: Eye, onSelect: () => setDetail(item) }, ...(item.status === "PENDING_APPROVAL" ? [{ id: "approve", label: "Valider", icon: CheckCircle2, onSelect: () => void decide(item, "APPROVE") }, { id: "reject", label: "Refuser", icon: XCircle, destructive: true, onSelect: () => void decide(item, "REJECT") }] : [])];
  const countActions = (item: Count): BusinessContextAction[] => [{ id: "open", label: "Ouvrir", icon: Eye, onSelect: () => setDetail(item) }, ...(item.status === "PENDING_APPROVAL" ? [{ id: "approve", label: "Valider les écarts", icon: CheckCircle2, onSelect: () => void decide(item, "APPROVE") }, { id: "reject", label: "Refuser", icon: XCircle, destructive: true, onSelect: () => void decide(item, "REJECT") }] : [])];

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={`Stock commun · ${organizationName}`} title="Stock, transferts et inventaires" description={`${definition.descriptionFr} Les mouvements restent idempotents, isolés par entreprise et protégés contre le stock négatif.`} count={`${stock.pagination.total} article${stock.pagination.total > 1 ? "s" : ""}`} primaryAction={<div data-responsive-actions><Button variant="outline" onClick={() => setAdjustOpen(true)}><PackageSearch className="h-4 w-4" />Ajustement</Button><Button variant="outline" onClick={() => setCountOpen(true)}><ClipboardCheck className="h-4 w-4" />Nouvel inventaire</Button><Button onClick={() => setTransferOpen(true)}><Truck className="h-4 w-4" />Nouveau transfert</Button></div>} />
    <ModuleMetrics label="Indicateurs stock"><ModuleMetric label="Articles suivis" value={stock.pagination.total} /><ModuleMetric label="Stock faible" value={stock.metrics.lowStockCount || 0} /><ModuleMetric label="Entrepôts" value={stock.metrics.warehouseCount || 0} /><ModuleMetric label="Transferts à valider" value={transfers.metrics.pending || 0} /><ModuleMetric label="Inventaires ouverts" value={counts.metrics.open || counts.metrics.pending || 0} /></ModuleMetrics>
    <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Article, code ou SKU…" />} controls={<><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={[{ id: "STOCK", label: "Stock", count: stock.pagination.total }, { id: "TRANSFERS", label: "Transferts", count: transfers.pagination.total }, { id: "COUNTS", label: "Inventaires", count: counts.pagination.total }]} />{tab !== "STOCK" ? <NativeSelect value={status} onChange={setStatus} items={[{ id: "", label: "Tous les statuts" }, ...Object.entries(INVENTORY_STATUS_LABELS).map(([id, label]) => ({ id, label }))]} /> : null}</>} summary="Les tableaux sont présentés sous forme de listes tactiles sur mobile." />
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold">{message}</div> : null}
      <ModuleSection title={tab === "STOCK" ? "Stock par article et emplacement" : tab === "TRANSFERS" ? "Transferts inter-entrepôts" : "Campagnes d’inventaire"} description={tab === "STOCK" ? "Quantités physiques, réservées et disponibles par article." : tab === "TRANSFERS" ? "Soumission, validation indépendante et mouvement contrôlé entre deux entrepôts." : "Comptage, comparaison théorique/réel et validation des écarts."}>
        {activeCollection.error ? <ProfessionalError message={activeCollection.error} /> : activeCollection.loading ? <ProfessionalLoading /> : tab === "STOCK" ? (stock.items.length ? <BusinessList ariaLabel="Stock par article">{stock.items.map((item) => <BusinessListItem key={item.id} title={`${item.catalogItem.code} · ${item.catalogItem.name}`} status={<StatusBadge tone={item.isLowStock ? "danger" : "success"}>{item.isLowStock ? "Stock faible" : "Disponible"}</StatusBadge>} meta={`${quantity(item.quantityAvailable, item.catalogItem.unitOfMeasure?.symbol)} disponible · ${quantity(item.quantityReserved, item.catalogItem.unitOfMeasure?.symbol)} réservé`} description={item.balances.map((balance) => `${balance.warehouse.name}${balance.storageLocation ? ` / ${balance.storageLocation.name}` : ""}: ${quantity(balance.quantityOnHand, item.catalogItem.unitOfMeasure?.symbol)}`).join(" · ") || "Aucun solde enregistré"} onOpen={() => setDetail(item)} openLabel={`Ouvrir le stock de ${item.catalogItem.name}`} />)}</BusinessList> : <EmptyState compact title="Aucun article suivi" description="Configurez le catalogue, les entrepôts et enregistrez la première réception." />) : tab === "TRANSFERS" ? (transfers.items.length ? <BusinessList ariaLabel="Transferts de stock">{transfers.items.map((item) => <BusinessListItem key={item.id} title={item.reference} leading={<Truck className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{INVENTORY_STATUS_LABELS[item.status] || item.status}</StatusBadge>} meta={`${item.sourceWarehouse.name} → ${item.destinationWarehouse.name}`} description={`${item.lines.length} ligne${item.lines.length > 1 ? "s" : ""} · demandé le ${new Date(item.requestedAt).toLocaleDateString("fr-FR")}`} onOpen={() => setDetail(item)} actions={<ContextActions label="Actions du transfert" actions={transferActions(item)} />} />)}</BusinessList> : <EmptyState compact title="Aucun transfert" description="Créez un transfert entre deux entrepôts distincts." />) : counts.items.length ? <BusinessList ariaLabel="Inventaires">{counts.items.map((item) => <BusinessListItem key={item.id} title={item.reference} leading={<ClipboardCheck className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{INVENTORY_STATUS_LABELS[item.status] || item.status}</StatusBadge>} meta={`${item.warehouse.name} · ${item.countType === "FULL" ? "Comptage complet" : item.countType === "CYCLE" ? "Comptage cyclique" : "Comptage ciblé"}`} description={`${item.lines.length} article${item.lines.length > 1 ? "s" : ""} compté${item.lines.length > 1 ? "s" : ""}`} onOpen={() => setDetail(item)} actions={<ContextActions label="Actions de l’inventaire" actions={countActions(item)} />} />)}</BusinessList> : <EmptyState compact title="Aucun inventaire" description="Créez une campagne, saisissez le comptage puis faites valider les écarts." />}
      </ModuleSection>
      <ProfessionalHelp moduleCode="INVENTORY_LOGISTICS" />
    </ModuleContent>

    <Dialog open={transferOpen} onClose={() => setTransferOpen(false)} title="Nouveau transfert de stock" description="Le site source et le site cible doivent être distincts. L’approbateur ne peut pas contourner les règles serveur." className="h-[94dvh] max-w-4xl"><form onSubmit={createTransfer} className="grid gap-5"><ProfessionalFormSection title="Trajet"><Field label="Entrepôt source"><NativeSelect name="sourceWarehouseId" required items={[{ id: "", label: "Sélectionner" }, ...lookups.warehouses.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label="Entrepôt cible"><NativeSelect name="destinationWarehouseId" required items={[{ id: "", label: "Sélectionner" }, ...lookups.warehouses.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label="Approbateur"><NativeSelect name="approverUserId" required items={[{ id: "", label: "Sélectionner une autre personne" }, ...lookups.members.map((item) => ({ id: item.id, label: `${item.label} · ${item.positionTitle || item.role}` }))]} /></Field><Field label="Motif"><Input name="notes" /></Field></ProfessionalFormSection><ProfessionalFormSection title="Article et quantité"><Field label="Article"><NativeSelect name="inventoryItemId" required items={[{ id: "", label: "Sélectionner" }, ...lookups.inventoryItems.map((item) => ({ id: item.id, label: `${item.code}${item.sku ? ` / ${item.sku}` : ""} · ${item.name}` }))]} /></Field><Field label="Quantité"><Input name="quantity" type="number" min="0.01" step="0.01" required /></Field><Field label="Emplacement source"><NativeSelect name="sourceLocationId" items={[{ id: "", label: "Non précisé" }, ...lookups.locations.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label="Emplacement cible"><NativeSelect name="destinationLocationId" items={[{ id: "", label: "Non précisé" }, ...lookups.locations.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>Annuler</Button><Button type="submit">Soumettre le transfert</Button></div></form></Dialog>

    <Dialog open={countOpen} onClose={() => setCountOpen(false)} title="Nouvelle campagne d’inventaire" className="h-[94dvh] max-w-4xl"><form onSubmit={createCount} className="grid gap-5"><ProfessionalFormSection title="Périmètre et responsabilité"><Field label="Entrepôt"><NativeSelect name="warehouseId" required items={[{ id: "", label: "Sélectionner" }, ...lookups.warehouses.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label="Type de comptage"><NativeSelect name="countType" defaultValue="FULL" items={[{ id: "FULL", label: "Complet" }, { id: "CYCLE", label: "Cyclique" }, { id: "SPOT", label: "Ciblé" }]} /></Field><Field label="Approbateur"><NativeSelect name="approverUserId" required items={[{ id: "", label: "Sélectionner" }, ...lookups.members.map((item) => ({ id: item.id, label: `${item.label} · ${item.positionTitle || item.role}` }))]} /></Field><Field label="Notes"><Input name="notes" /></Field></ProfessionalFormSection><ProfessionalFormSection title="Premier comptage"><Field label="Article"><NativeSelect name="inventoryItemId" required items={[{ id: "", label: "Sélectionner" }, ...lookups.inventoryItems.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label="Quantité comptée"><Input name="countedQuantity" type="number" min="0" step="0.01" required /></Field><Field label="Observation"><Input name="lineNotes" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCountOpen(false)}>Annuler</Button><Button type="submit">Créer l’inventaire</Button></div></form></Dialog>

    <Dialog open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Ajustement contrôlé" description="Un ajustement ne modifie pas silencieusement l’historique : il crée un mouvement traçable et soumis à validation." className="h-[92dvh] max-w-3xl"><form onSubmit={createAdjustment} className="grid gap-5"><ProfessionalFormSection title="Ajustement"><Field label="Article"><NativeSelect name="inventoryItemId" required items={[{ id: "", label: "Sélectionner" }, ...lookups.inventoryItems.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label="Entrepôt"><NativeSelect name="warehouseId" required items={[{ id: "", label: "Sélectionner" }, ...lookups.warehouses.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label="Sens"><NativeSelect name="adjustmentType" defaultValue="IN" items={[{ id: "IN", label: "Entrée" }, { id: "OUT", label: "Sortie" }]} /></Field><Field label="Quantité"><Input name="quantity" type="number" min="0.01" step="0.01" required /></Field><Field label="Motif"><Input name="reason" minLength={3} required /></Field><Field label="Approbateur"><NativeSelect name="approverUserId" required items={[{ id: "", label: "Sélectionner" }, ...lookups.members.map((item) => ({ id: item.id, label: `${item.label} · ${item.positionTitle || item.role}` }))]} /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setAdjustOpen(false)}>Annuler</Button><Button type="submit">Soumettre l’ajustement</Button></div></form></Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail && "reference" in detail ? detail.reference : detail && "catalogItem" in detail ? detail.catalogItem.name : "Détail opérationnel"} className="h-[88dvh] max-w-4xl">{detail && "catalogItem" in detail ? <BusinessList ariaLabel="Soldes par emplacement">{detail.balances.map((balance) => <BusinessListItem key={balance.id} title={`${balance.warehouse.code} · ${balance.warehouse.name}`} meta={balance.storageLocation ? `${balance.storageLocation.code} · ${balance.storageLocation.name}` : "Sans emplacement"} description={balance.stockLot ? `Lot ${balance.stockLot.lotNumber}${balance.stockLot.expiryDate ? ` · expire le ${new Date(balance.stockLot.expiryDate).toLocaleDateString("fr-FR")}` : ""}` : "Sans lot"} status={<StatusBadge>{quantity(balance.quantityOnHand)}</StatusBadge>} />)}</BusinessList> : detail && "sourceWarehouse" in detail ? <div className="grid gap-4"><p className="text-sm text-dtsc-muted">{detail.sourceWarehouse.name} → {detail.destinationWarehouse.name}</p><BusinessList ariaLabel="Lignes du transfert">{detail.lines.map((line) => <BusinessListItem key={line.id} title={lookups.inventoryItems.find((item) => item.id === line.inventoryItemId)?.name || "Article"} status={<StatusBadge>{quantity(line.quantity)}</StatusBadge>} />)}</BusinessList></div> : detail && "warehouse" in detail ? <BusinessList ariaLabel="Écarts d’inventaire">{detail.lines.map((line) => <BusinessListItem key={line.id} title={lookups.inventoryItems.find((item) => item.id === line.inventoryItemId)?.name || "Article"} meta={`Théorique : ${line.theoreticalQuantity} · Compté : ${line.countedQuantity ?? "—"}`} status={<StatusBadge tone={Number(line.varianceQuantity || 0) === 0 ? "success" : "warning"}>Écart {line.varianceQuantity ?? "—"}</StatusBadge>} />)}</BusinessList> : null}</Dialog>
  </ModuleWorkspace>;
}
