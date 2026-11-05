"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Clock3, Download, FileText, Play, RefreshCw, Send, Square, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { useProfessionalErpLocale } from "@/components/enterprise/professional/professional-erp-i18n";

type Payslip = {
  id: string; payslipNumber: string; generatedAt: string | null; currency: string;
  grossAmount: string; deductionAmount: string; netAmount: string;
  payrollItem: { payrollRun: { reference: string; approvedAt: string | null; payrollPeriod: { name: string; periodStart: string; periodEnd: string; payDate: string | null } } };
};
type Clock = { id: string; startedAt: string; stoppedAt: string | null; workSummary: string | null; revision: number };
type Sheet = { id: string; reference: string; status: string; periodStart: string; periodEnd: string; totalDeclaredMinutes: number; totalApprovedMinutes: number; correctionComment: string | null; rejectionComment: string | null };
type SelfData = {
  linked: boolean; payrollEnabled: boolean; timeEnabled: boolean; canClock: boolean; canSubmitReport: boolean;
  employee?: { id: string; employeeNumber: string; displayName: string };
  payslips: Payslip[]; timesheets: Sheet[]; clockSessions: Clock[];
  payslipsPagination?: { page: number; pages: number; total: number };
};
type Approver = { userId: string; name?: string | null; label?: string; email?: string };

const copy = {
  fr: {
    title: "Mon espace RH", description: "Vos bulletins privés, votre pointage et vos rapports de travail.",
    linking: "Votre compte n'est pas encore lié à un dossier salarié actif. Contactez votre responsable RH pour activer cet espace personnel.",
    loading: "Chargement de votre espace RH…", refresh: "Actualiser",
    pays: "Mes bulletins de paie", noPays: "Aucun bulletin approuvé pour le moment.",
    pdf: "Télécharger le PDF", net: "Net à payer", approved: "Paie approuvée, décaissement non présumé",
    time: "Mon temps de travail", start: "Débuter le pointage", stop: "Terminer le pointage",
    running: "Pointage en cours", idle: "Aucun pointage en cours", past: "Dernières sessions", noPast: "Aucune session enregistrée.",
    summary: "Résumé de la session (facultatif)", report: "Soumettre un rapport de travail",
    day: "Date de travail", hours: "Heures travaillées", desc: "Travail réalisé", approver: "Validateur indépendant",
    selectApprover: "Choisir un validateur", submit: "Soumettre le rapport", history: "Rapports précédents",
    noHistory: "Aucun rapport soumis.", declared: "Déclaré", accepted: "Approuvé",
    page: "Page", previous: "Précédente", next: "Suivante",
    sent: "Votre rapport de travail a été soumis au validateur sélectionné.",
    started: "Votre pointage a commencé, à l'heure du serveur.",
    stopped: "Votre pointage a été terminé et conservé dans l'historique.",
    emptyDescription: "Décrivez les tâches réalisées avant de soumettre le rapport.",
    noApprover: "Choisissez un validateur indépendant habilité.",
    failed: "Cette opération n'a pas abouti. Vérifiez vos données et réessayez.",
    unavailable: "L'espace RH personnel est indisponible pour le moment.",
    already: "Un pointage est déjà en cours. Terminez-le d'abord.",
    notRunning: "Aucun pointage actif à terminer.",
  },
  en: {
    title: "My HR space", description: "Your private payslips, work clock and work reports.",
    linking: "Your account is not yet linked to an active employee record. Contact HR to activate this personal space.",
    loading: "Loading your HR space…", refresh: "Refresh",
    pays: "My payslips", noPays: "No approved payslips yet.",
    pdf: "Download PDF", net: "Net payable", approved: "Payroll approved; payment not presumed",
    time: "My working time", start: "Clock in", stop: "Clock out",
    running: "Clock running", idle: "No active clock", past: "Recent sessions", noPast: "No work sessions recorded.",
    summary: "Session summary (optional)", report: "Submit a work report",
    day: "Work date", hours: "Hours worked", desc: "Work performed", approver: "Independent approver",
    selectApprover: "Choose an approver", submit: "Submit work report", history: "Previous reports",
    noHistory: "No reports submitted.", declared: "Declared", accepted: "Approved",
    page: "Page", previous: "Previous", next: "Next",
    sent: "Your work report was submitted to the selected approver.",
    started: "Clock-in recorded using server time.",
    stopped: "Clock-out recorded and preserved in history.",
    emptyDescription: "Describe the work performed before submitting.",
    noApprover: "Choose an authorized independent approver.",
    failed: "The operation failed. Check your details and try again.",
    unavailable: "Your personal HR space is temporarily unavailable.",
    already: "A clock-in is already running. Stop it first.",
    notRunning: "There is no running work session to stop.",
  },
} as const;

function todayLocalDateInput() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function EnterpriseMyHrSelfService({ organizationId }: { organizationId: string }) {
  const locale = useProfessionalErpLocale();
  const c = copy[locale === "en" ? "en" : "fr"];
  const [data, setData] = useState<SelfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [workSummary, setWorkSummary] = useState("");
  useToastMessage(success, "success");
  useToastMessage(error, "error");

  useEffect(() => {
    let active = true;
    setData(null); setLoading(true);
    void fetch(`/api/enterprise/${organizationId}/my-hr?page=${page}&pageSize=10`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as (SelfData & { message?: string }) | null;
        if (response.status === 403) { if (active) { setData(null); setError(""); } return; }
        if (!response.ok || !payload) throw new Error(payload?.message || c.unavailable);
        if (active) { setData(payload); setError(""); }
      }).catch((err) => { if (active) setError(err instanceof Error ? err.message : c.unavailable); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, page, refresh, c.unavailable]);

  useEffect(() => {
    let active = true;
    if (!data?.canSubmitReport) return;
    void fetch(`/api/enterprise/${organizationId}/my-hr/approvers`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { approvers?: Approver[] }) => { if (active) setApprovers(payload.approvers || []); })
      .catch(() => { if (active) setApprovers([]); });
    return () => { active = false; };
  }, [data?.canSubmitReport, organizationId]);

  const date = (value: string | null) => value
    ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value))
    : "—";
  const time = (value: string | null) => value
    ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
    : "—";
  const money = (amount: string, currency: string) =>
    new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(amount)) + " " + currency;
  const activeClock = data?.clockSessions.find((clock) => !clock.stoppedAt);
  const errorMessage = (body: { error?: string; message?: string } | null) => {
    if (body?.error === "EMPLOYEE_CLOCK_ALREADY_RUNNING") return c.already;
    if (body?.error === "EMPLOYEE_CLOCK_NOT_RUNNING") return c.notRunning;
    return body?.message || c.failed;
  };

  async function post(url: string, payload: unknown) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
    if (!response.ok) throw new Error(errorMessage(body));
    return body;
  }

  async function clock(action: "START" | "STOP") {
    if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await post(`/api/enterprise/${organizationId}/my-hr/clock`, { action, workSummary: action === "STOP" ? workSummary.trim() : null });
      setWorkSummary("");
      setSuccess(action === "START" ? c.started : c.stopped);
      setRefresh((v) => v + 1);
    } catch (err) { setError(err instanceof Error ? err.message : c.failed); }
    finally { setBusy(false); }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const description = String(values.get("description") || "").trim();
    const approverUserId = String(values.get("approverUserId") || "");
    const day = String(values.get("day") || "");
    const declaredMinutes = Math.round(Number(values.get("hours") || 0) * 60);
    if (!description) return setError(c.emptyDescription);
    if (!approverUserId) return setError(c.noApprover);
    if (!day || declaredMinutes <= 0 || declaredMinutes > 1440) return setError(c.failed);
    const workDate = day;
    setBusy(true); setError(""); setSuccess("");
    try {
      await post(`/api/enterprise/${organizationId}/my-hr/reports`, {
        periodStart: workDate, periodEnd: workDate, approverUserId,
        entries: [{ workDate, declaredMinutes, breakMinutes: 0, serviceDescription: description, billable: false }],
      });
      form.reset(); setSuccess(c.sent); setRefresh((v) => v + 1);
    } catch (err) { setError(err instanceof Error ? err.message : c.failed); }
    finally { setBusy(false); }
  }

  if (!data && loading) return <div className="rounded-2xl border border-dtsc-border p-4 text-sm text-dtsc-muted">{c.loading}</div>;
  if (!data) return null;
  return <section aria-label={c.title} className="grid gap-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-black text-dtsc-text">{c.title}</h2><p className="text-sm text-dtsc-muted">{c.description}</p></div>
      <Button variant="outline" size="sm" disabled={loading || busy} onClick={() => setRefresh((v) => v + 1)}><RefreshCw className="mr-1 h-4 w-4" />{c.refresh}</Button>
    </header>
    {!data.linked ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">{c.linking}</div> : <>
      {data.payrollEnabled ? <article className="grid gap-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-800 dark:bg-sky-950/20">
        <h3 className="flex items-center gap-2 font-bold text-sky-900 dark:text-sky-100"><Wallet className="h-5 w-5" />{c.pays}</h3>
        {!data.payslips.length ? <p className="text-sm text-sky-700 dark:text-sky-300">{c.noPays}</p> : data.payslips.map((payslip) => <div key={payslip.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-white/85 p-3 dark:border-sky-900 dark:bg-slate-900/75">
          <div><p className="font-semibold">{payslip.payrollItem.payrollRun.payrollPeriod.name} · {payslip.payslipNumber}</p>
            <p className="text-xs text-dtsc-muted">{date(payslip.generatedAt)} · {c.approved}</p>
            <p className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-400">{c.net}: {money(payslip.netAmount, payslip.currency)}</p></div>
          <a className="inline-flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-100 px-3 py-2 text-sm font-semibold text-sky-950 hover:bg-sky-200 focus-visible:outline focus-visible:outline-2 dark:border-sky-700 dark:bg-sky-900 dark:text-sky-100" href={`/api/enterprise/${organizationId}/my-hr/payslips/${payslip.id}/pdf?lang=${locale === "en" ? "en" : "fr"}`}><Download className="h-4 w-4" />{c.pdf}</a>
        </div>)}
        {data.payslipsPagination && data.payslipsPagination.pages > 1 ? <div className="flex items-center justify-end gap-3">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{c.previous}</Button>
          <span className="text-xs text-dtsc-muted">{c.page} {page}/{data.payslipsPagination.pages}</span>
          <Button size="sm" variant="outline" disabled={page >= data.payslipsPagination.pages} onClick={() => setPage((p) => p + 1)}>{c.next}</Button>
        </div> : null}
      </article> : null}
      {data.timeEnabled || data.canClock ? <article className="grid gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
        <h3 className="flex items-center gap-2 font-bold text-emerald-950 dark:text-emerald-100"><Clock3 className="h-5 w-5" />{c.time}</h3>
        {data.canClock ? <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${activeClock ? "bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-100" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>{activeClock ? `${c.running} · ${time(activeClock.startedAt)}` : c.idle}</span>
          {activeClock ? <div className="flex flex-wrap items-center gap-2">
            <Input value={workSummary} onChange={(event) => setWorkSummary(event.target.value)} placeholder={c.summary} maxLength={2000} />
            <Button disabled={busy} onClick={() => void clock("STOP")}><Square className="mr-2 h-4 w-4" />{c.stop}</Button>
          </div> : <Button disabled={busy} onClick={() => void clock("START")}><Play className="mr-2 h-4 w-4" />{c.start}</Button>}
        </div> : null}
        <div className="grid gap-2">
          <h4 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">{c.past}</h4>
          {!data.clockSessions.length ? <p className="text-sm text-dtsc-muted">{c.noPast}</p> : data.clockSessions.slice(0, 6).map((entry) => <div key={entry.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-white/80 p-2 text-xs dark:bg-slate-900/75"><span>{time(entry.startedAt)} → {entry.stoppedAt ? time(entry.stoppedAt) : c.running}</span><span className="text-dtsc-muted">{entry.workSummary || "—"}</span></div>)}
        </div>
      </article> : null}
      {data.canSubmitReport ? <article className="grid gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-800 dark:bg-violet-950/20">
        <h3 className="flex items-center gap-2 font-bold text-violet-900 dark:text-violet-100"><FileText className="h-5 w-5" />{c.report}</h3>
        <form onSubmit={(event) => void submitReport(event)} className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">{c.day}<Input name="day" type="date" required defaultValue={todayLocalDateInput()} /></label>
          <label className="grid gap-1 text-sm font-semibold">{c.hours}<Input name="hours" type="number" min="0.25" max="24" step="0.25" required defaultValue="8" /></label>
          <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{c.desc}<textarea name="description" minLength={3} maxLength={1000} required className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm" /></label>
          <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{c.approver}<select name="approverUserId" required defaultValue="" className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm">
            <option value="">{c.selectApprover}</option>{approvers.map((candidate) => <option key={candidate.userId} value={candidate.userId}>{candidate.name || candidate.label || candidate.email || candidate.userId}</option>)}
          </select></label>
          <div className="sm:col-span-2"><Button type="submit" disabled={busy || !approvers.length}><Send className="mr-2 h-4 w-4" />{c.submit}</Button></div>
        </form>
        <div className="grid gap-2"><h4 className="text-sm font-semibold text-violet-900 dark:text-violet-100">{c.history}</h4>
          {!data.timesheets.length ? <p className="text-sm text-dtsc-muted">{c.noHistory}</p> : data.timesheets.slice(0, 8).map((sheet) => <div key={sheet.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-white/80 p-2 text-xs dark:bg-slate-900/75"><span>{sheet.reference} · {date(sheet.periodStart)} · {sheet.status}</span><span>{c.declared}: {(sheet.totalDeclaredMinutes / 60).toFixed(1)} h · {c.accepted}: {(sheet.totalApprovedMinutes / 60).toFixed(1)} h</span></div>)}
        </div>
      </article> : null}
    </>}
  </section>;
}
