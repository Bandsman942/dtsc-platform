"use client";

import { useMemo, useState } from "react";
import { Calculator, Eraser, HelpCircle, RotateCcw, Sigma, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";

type CalculatorMode = "standard" | "scientific" | "financial";
type FinancialFormulaId = "payment" | "future-value" | "present-value" | "cagr" | "roi" | "npv" | "break-even" | "effective-rate";
type FinancialValues = Record<string, string>;
type FinancialField = { key: string; fr: string; en: string; placeholder?: string; text?: boolean };
type FinancialFormula = {
  id: FinancialFormulaId;
  fr: string;
  en: string;
  descriptionFr: string;
  descriptionEn: string;
  formula: string;
  fields: FinancialField[];
  compute: (values: FinancialValues) => number;
};

const FINANCIAL_FORMULAS: FinancialFormula[] = [
  {
    id: "payment",
    fr: "Mensualité d’emprunt",
    en: "Loan payment",
    descriptionFr: "Mensualité constante d’un emprunt amortissable à partir du capital, du taux annuel nominal et du nombre de mois.",
    descriptionEn: "Constant payment for an amortizing loan using principal, nominal annual rate and number of months.",
    formula: "PMT = P × r / (1 − (1 + r)^−n)",
    fields: [
      { key: "principal", fr: "Capital", en: "Principal", placeholder: "10000" },
      { key: "annualRate", fr: "Taux annuel (%)", en: "Annual rate (%)", placeholder: "12" },
      { key: "months", fr: "Nombre de mois", en: "Months", placeholder: "24" },
    ],
    compute: (values) => {
      const principal = numeric(values.principal);
      const months = positiveInteger(values.months);
      const monthlyRate = numeric(values.annualRate) / 100 / 12;
      return monthlyRate === 0 ? principal / months : principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
    },
  },
  {
    id: "future-value",
    fr: "Valeur future",
    en: "Future value",
    descriptionFr: "Valeur future d’un capital avec capitalisation périodique.",
    descriptionEn: "Future value of a principal compounded periodically.",
    formula: "FV = PV × (1 + r/m)^(m×t)",
    fields: [
      { key: "presentValue", fr: "Valeur actuelle", en: "Present value", placeholder: "10000" },
      { key: "annualRate", fr: "Taux annuel (%)", en: "Annual rate (%)", placeholder: "8" },
      { key: "years", fr: "Durée (années)", en: "Years", placeholder: "5" },
      { key: "compounds", fr: "Capitalisations/an", en: "Compounds/year", placeholder: "12" },
    ],
    compute: (values) => {
      const pv = numeric(values.presentValue);
      const rate = numeric(values.annualRate) / 100;
      const years = positive(values.years);
      const compounds = positiveInteger(values.compounds);
      return pv * Math.pow(1 + rate / compounds, compounds * years);
    },
  },
  {
    id: "present-value",
    fr: "Valeur actuelle",
    en: "Present value",
    descriptionFr: "Valeur actuelle d’un montant futur actualisé à un taux donné.",
    descriptionEn: "Present value of a future amount discounted at a given rate.",
    formula: "PV = FV / (1 + r/m)^(m×t)",
    fields: [
      { key: "futureValue", fr: "Valeur future", en: "Future value", placeholder: "15000" },
      { key: "annualRate", fr: "Taux annuel (%)", en: "Annual rate (%)", placeholder: "8" },
      { key: "years", fr: "Durée (années)", en: "Years", placeholder: "5" },
      { key: "compounds", fr: "Capitalisations/an", en: "Compounds/year", placeholder: "12" },
    ],
    compute: (values) => {
      const fv = numeric(values.futureValue);
      const rate = numeric(values.annualRate) / 100;
      const years = positive(values.years);
      const compounds = positiveInteger(values.compounds);
      return fv / Math.pow(1 + rate / compounds, compounds * years);
    },
  },
  {
    id: "cagr",
    fr: "Taux de croissance annuel composé",
    en: "CAGR",
    descriptionFr: "Croissance annuelle moyenne nécessaire pour passer d’une valeur initiale à une valeur finale.",
    descriptionEn: "Average annual compounded growth needed to move from an initial value to a final value.",
    formula: "CAGR = (Vf / Vi)^(1/t) − 1",
    fields: [
      { key: "initialValue", fr: "Valeur initiale", en: "Initial value", placeholder: "10000" },
      { key: "finalValue", fr: "Valeur finale", en: "Final value", placeholder: "15000" },
      { key: "years", fr: "Durée (années)", en: "Years", placeholder: "3" },
    ],
    compute: (values) => (Math.pow(positive(values.finalValue) / positive(values.initialValue), 1 / positive(values.years)) - 1) * 100,
  },
  {
    id: "roi",
    fr: "Retour sur investissement",
    en: "ROI",
    descriptionFr: "Rendement simple d’un investissement à partir du coût initial et de la valeur finale.",
    descriptionEn: "Simple investment return using initial cost and final value.",
    formula: "ROI = (Valeur finale − Coût) / Coût",
    fields: [
      { key: "cost", fr: "Coût initial", en: "Initial cost", placeholder: "10000" },
      { key: "finalValue", fr: "Valeur finale", en: "Final value", placeholder: "12500" },
    ],
    compute: (values) => ((numeric(values.finalValue) - positive(values.cost)) / positive(values.cost)) * 100,
  },
  {
    id: "npv",
    fr: "Valeur actuelle nette (VAN)",
    en: "Net present value (NPV)",
    descriptionFr: "Actualise une série de flux périodiques puis retranche l’investissement initial.",
    descriptionEn: "Discounts periodic cash flows and subtracts the initial investment.",
    formula: "VAN = −I₀ + Σ CFt / (1+r)^t",
    fields: [
      { key: "initialInvestment", fr: "Investissement initial", en: "Initial investment", placeholder: "10000" },
      { key: "discountRate", fr: "Taux par période (%)", en: "Rate per period (%)", placeholder: "10" },
      { key: "cashFlows", fr: "Flux périodiques", en: "Periodic cash flows", placeholder: "3000; 3500; 4000; 4500", text: true },
    ],
    compute: (values) => {
      const initial = numeric(values.initialInvestment);
      const rate = numeric(values.discountRate) / 100;
      return cashFlows(values.cashFlows).reduce((total, flow, index) => total + flow / Math.pow(1 + rate, index + 1), -initial);
    },
  },
  {
    id: "break-even",
    fr: "Seuil de rentabilité",
    en: "Break-even units",
    descriptionFr: "Nombre d’unités à vendre pour couvrir les coûts fixes.",
    descriptionEn: "Units required to cover fixed costs.",
    formula: "Unités = Coûts fixes / (Prix − Coût variable)",
    fields: [
      { key: "fixedCosts", fr: "Coûts fixes", en: "Fixed costs", placeholder: "5000" },
      { key: "unitPrice", fr: "Prix unitaire", en: "Unit price", placeholder: "25" },
      { key: "unitVariableCost", fr: "Coût variable/unité", en: "Unit variable cost", placeholder: "15" },
    ],
    compute: (values) => {
      const contribution = numeric(values.unitPrice) - numeric(values.unitVariableCost);
      if (contribution <= 0) throw new Error("CONTRIBUTION");
      return numeric(values.fixedCosts) / contribution;
    },
  },
  {
    id: "effective-rate",
    fr: "Taux annuel effectif",
    en: "Effective annual rate",
    descriptionFr: "Convertit un taux annuel nominal en taux effectif selon la fréquence de capitalisation.",
    descriptionEn: "Converts a nominal annual rate into an effective rate for the compounding frequency.",
    formula: "EAR = (1 + r/m)^m − 1",
    fields: [
      { key: "nominalRate", fr: "Taux nominal annuel (%)", en: "Nominal annual rate (%)", placeholder: "12" },
      { key: "compounds", fr: "Capitalisations/an", en: "Compounds/year", placeholder: "12" },
    ],
    compute: (values) => {
      const compounds = positiveInteger(values.compounds);
      return (Math.pow(1 + numeric(values.nominalRate) / 100 / compounds, compounds) - 1) * 100;
    },
  },
];

const DEFAULT_FINANCIAL_VALUES: FinancialValues = {
  principal: "10000", annualRate: "12", months: "24", presentValue: "10000", futureValue: "15000",
  years: "5", compounds: "12", initialValue: "10000", finalValue: "15000", cost: "10000",
  initialInvestment: "10000", discountRate: "10", cashFlows: "3000; 3500; 4000; 4500",
  fixedCosts: "5000", unitPrice: "25", unitVariableCost: "15", nominalRate: "12",
};

export function ProfessionalCalculatorV2({ english }: { english: boolean }) {
  const [mode, setMode] = useState<CalculatorMode>("standard");
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState("");
  const [selectedFormulaId, setSelectedFormulaId] = useState<FinancialFormulaId>("payment");
  const [financialValues, setFinancialValues] = useState<FinancialValues>(DEFAULT_FINANCIAL_VALUES);
  const [financialResult, setFinancialResult] = useState("");
  const [showHelp, setShowHelp] = useState(true);
  const selectedFormula = useMemo(() => FINANCIAL_FORMULAS.find((formula) => formula.id === selectedFormulaId) || FINANCIAL_FORMULAS[0], [selectedFormulaId]);

  function append(value: string) { setExpression((current) => `${current}${value}`); }
  function calculateExpression() {
    try { setResult(formatNumber(new SafeExpressionParser(expression).parse(), english)); }
    catch (error) { setResult(formatExpressionError(error, english)); }
  }
  function calculateFinancial() {
    try {
      const value = selectedFormula.compute(financialValues);
      const suffix = ["cagr", "roi", "effective-rate"].includes(selectedFormula.id) ? " %" : selectedFormula.id === "break-even" ? (english ? " units" : " unités") : "";
      setFinancialResult(`${formatNumber(value, english)}${suffix}`);
    } catch (error) { setFinancialResult(formatFinancialError(error, english)); }
  }

  const modes = [
    { id: "standard" as const, label: "Standard", icon: Calculator },
    { id: "scientific" as const, label: english ? "Scientific" : "Scientifique", icon: Sigma },
    { id: "financial" as const, label: english ? "Financial" : "Financière", icon: WalletCards },
  ];

  return (
    <section className="grid min-w-0 gap-4" aria-label={english ? "Professional calculator" : "Calculatrice professionnelle"}>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {modes.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setMode(id)} aria-pressed={mode === id} className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-black transition", mode === id ? "border-cyan-500 bg-cyan-500/15 text-cyan-800 dark:text-cyan-200" : "border-dtsc-border bg-dtsc-page text-dtsc-muted hover:bg-dtsc-soft")}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {mode === "financial" ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(16rem,0.78fr)_minmax(0,1.5fr)]">
          <aside className="min-w-0 rounded-[1.6rem] border border-dtsc-border bg-dtsc-page p-3">
            <p className="px-2 pb-2 text-xs font-black uppercase tracking-[0.14em] text-dtsc-muted">{english ? "Financial formulas" : "Formules financières"}</p>
            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
              {FINANCIAL_FORMULAS.map((formula) => (
                <button key={formula.id} type="button" onClick={() => { setSelectedFormulaId(formula.id); setFinancialResult(""); }} className={cn("rounded-xl px-3 py-3 text-left text-sm font-black transition", selectedFormulaId === formula.id ? "bg-dtsc-blue text-white" : "text-dtsc-ink hover:bg-dtsc-soft")}>{english ? formula.en : formula.fr}</button>
              ))}
            </div>
          </aside>
          <div className="grid min-w-0 gap-4">
            <div className="rounded-[1.6rem] border border-dtsc-border bg-dtsc-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-200">{english ? "Financial assistant" : "Assistant financier"}</p><h3 className="mt-1 text-xl font-black text-dtsc-ink sm:text-2xl">{english ? selectedFormula.en : selectedFormula.fr}</h3></div>
                <button type="button" onClick={() => setShowHelp((current) => !current)} aria-expanded={showHelp} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-xs font-black text-dtsc-ink"><HelpCircle className="h-4 w-4" />{english ? "Help" : "Aide"}</button>
              </div>
              {showHelp ? <div className="mt-4 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4"><p className="text-sm leading-6 text-dtsc-muted">{english ? selectedFormula.descriptionEn : selectedFormula.descriptionFr}</p><p className="mt-2 overflow-x-auto font-mono text-xs font-bold text-dtsc-ink">{selectedFormula.formula}</p><p className="mt-2 text-xs leading-5 text-dtsc-muted">{english ? "Use consistent monetary units. Rates are percentages. Validate estimates in the relevant Finance workflow before a business decision." : "Utilisez des unités monétaires cohérentes. Les taux sont des pourcentages. Validez les estimations dans le workflow Finance concerné avant une décision métier."}</p></div> : null}
              <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
                {selectedFormula.fields.map((field) => (
                  <label key={field.key} className={cn("grid gap-1.5 text-sm font-black text-dtsc-ink", field.text && "sm:col-span-2")}>{english ? field.en : field.fr}<input type="text" inputMode={field.text ? "text" : "decimal"} value={financialValues[field.key] || ""} onChange={(event) => setFinancialValues((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} className="h-12 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-base font-bold text-dtsc-ink outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-300/30" /></label>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={calculateFinancial} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-dtsc-blue px-4 text-sm font-black text-white"><Calculator className="h-4 w-4" />{english ? "Calculate" : "Calculer"}</button><button type="button" onClick={() => { setFinancialValues(DEFAULT_FINANCIAL_VALUES); setFinancialResult(""); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-4 text-sm font-black text-dtsc-ink"><RotateCcw className="h-4 w-4" />{english ? "Reset" : "Réinitialiser"}</button></div>
            </div>
            <ResultPanel label={english ? "Financial result" : "Résultat financier"} value={financialResult} />
          </div>
        </div>
      ) : (
        <div className="mx-auto grid w-full max-w-[34rem] gap-4">
          <div className="overflow-hidden rounded-[2rem] border border-dtsc-border bg-[#07162c] shadow-[0_24px_70px_rgba(0,23,54,0.22)]">
            <div className="min-h-32 border-b border-white/10 px-5 py-5 text-right text-white"><div className="min-h-7 break-all text-sm font-semibold text-slate-300">{expression || (english ? "Enter a calculation" : "Saisissez un calcul")}</div><div className="mt-3 min-h-12 break-all text-4xl font-black tracking-tight sm:text-5xl" aria-live="polite">{result || "0"}</div></div>
            {mode === "scientific" ? <div className="flex gap-2 overflow-x-auto border-b border-white/10 px-3 py-3 [scrollbar-width:thin]">{["sin(", "cos(", "tan(", "sqrt(", "log(", "ln(", "abs(", "pow(", "pi", "e", "^", "(", ")", ","].map((key) => <CalcKey key={key} label={key} onClick={() => append(key)} compact />)}</div> : null}
            <div className="grid grid-cols-4 gap-2 p-3 sm:gap-3 sm:p-4">
              <CalcKey label="AC" onClick={() => { setExpression(""); setResult(""); }} accent="utility" /><CalcKey label="±" onClick={() => setExpression((current) => current ? `-(${current})` : "-")} accent="utility" /><CalcKey label="%" onClick={() => append("%")} accent="utility" /><CalcKey label="÷" onClick={() => append("/")} accent="operator" />
              {[["7","7"],["8","8"],["9","9"]].map(([label,value]) => <CalcKey key={label} label={label} onClick={() => append(value)} />)}<CalcKey label="×" onClick={() => append("*")} accent="operator" />
              {[["4","4"],["5","5"],["6","6"]].map(([label,value]) => <CalcKey key={label} label={label} onClick={() => append(value)} />)}<CalcKey label="−" onClick={() => append("-")} accent="operator" />
              {[["1","1"],["2","2"],["3","3"]].map(([label,value]) => <CalcKey key={label} label={label} onClick={() => append(value)} />)}<CalcKey label="+" onClick={() => append("+")} accent="operator" />
              <CalcKey label="0" onClick={() => append("0")} className="col-span-2" /><CalcKey label="." onClick={() => append(".")} /><CalcKey label="=" onClick={calculateExpression} accent="equals" />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3"><p className="text-xs leading-5 text-slate-300">{mode === "scientific" ? (english ? "Trigonometric functions use radians." : "Les fonctions trigonométriques utilisent les radians.") : (english ? "Conventional keypad; % is a postfix percentage." : "Clavier conventionnel ; % est un pourcentage postfixé.")}</p><button type="button" onClick={() => setExpression((current) => current.slice(0, -1))} className="grid h-10 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/15" aria-label={english ? "Backspace" : "Effacer le dernier caractère"}><Eraser className="h-5 w-5" /></button></div>
          </div>
        </div>
      )}
    </section>
  );
}

function ResultPanel({ label, value }: { label: string; value: string }) { return <div className="rounded-[1.6rem] border border-cyan-400/35 bg-cyan-400/10 p-5" aria-live="polite"><p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-200">{label}</p><p className="mt-2 break-words text-3xl font-black text-dtsc-ink">{value || "—"}</p></div>; }
function CalcKey({ label, onClick, accent = "number", className, compact = false }: { label: string; onClick: () => void; accent?: "number" | "utility" | "operator" | "equals"; className?: string; compact?: boolean }) { return <button type="button" onClick={onClick} className={cn("select-none rounded-2xl font-black transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300", compact ? "h-10 min-w-14 shrink-0 px-3 text-xs" : "min-h-14 text-xl sm:min-h-16", accent === "number" && "bg-white/10 text-white hover:bg-white/15", accent === "utility" && "bg-slate-200 text-slate-950 hover:bg-white", accent === "operator" && "bg-cyan-500 text-[#001736] hover:bg-cyan-400", accent === "equals" && "bg-amber-400 text-slate-950 hover:bg-amber-300", className)}>{label}</button>; }

class SafeExpressionParser {
  private position = 0;
  private readonly source: string;
  constructor(raw: string) {
    // Keep comma as the scientific argument separator (e.g. pow(2,3)).
    this.source = raw.replaceAll("×", "*").replaceAll("÷", "/").replaceAll("−", "-").trim();
  }
  parse() { if (!this.source) throw new Error("EMPTY"); const value = this.parseExpression(); this.skipSpaces(); if (this.position !== this.source.length || !Number.isFinite(value)) throw new Error("INVALID"); return value; }
  private parseExpression(): number { let value = this.parseTerm(); while (true) { if (this.consume("+")) value += this.parseTerm(); else if (this.consume("-")) value -= this.parseTerm(); else return value; } }
  private parseTerm(): number { let value = this.parsePower(); while (true) { if (this.consume("*")) value *= this.parsePower(); else if (this.consume("/")) { const divisor = this.parsePower(); if (divisor === 0) throw new Error("DIV_ZERO"); value /= divisor; } else return value; } }
  private parsePower(): number { let value = this.parseUnary(); if (this.consume("^")) value = Math.pow(value, this.parsePower()); return value; }
  private parseUnary(): number { if (this.consume("+")) return this.parseUnary(); if (this.consume("-")) return -this.parseUnary(); return this.parsePostfix(); }
  private parsePostfix(): number { let value = this.parsePrimary(); while (this.consume("%")) value /= 100; return value; }
  private parsePrimary(): number {
    this.skipSpaces();
    if (this.consume("(")) { const value = this.parseExpression(); if (!this.consume(")")) throw new Error("PAREN"); return value; }
    const number = this.readNumber(); if (number !== null) return number;
    const identifier = this.readIdentifier(); if (!identifier) throw new Error("INVALID");
    const name = identifier.toLowerCase(); if (name === "pi") return Math.PI; if (name === "e") return Math.E;
    if (!this.consume("(")) throw new Error("FUNCTION");
    const args = [this.parseExpression()];
    while (this.consume(",")) args.push(this.parseExpression());
    if (!this.consume(")")) throw new Error("PAREN");
    return scientificFunction(name, args);
  }
  private readNumber() { this.skipSpaces(); const match = this.source.slice(this.position).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i); if (!match) return null; this.position += match[0].length; return Number(match[0]); }
  private readIdentifier() { this.skipSpaces(); const match = this.source.slice(this.position).match(/^[a-z]+/i); if (!match) return null; this.position += match[0].length; return match[0]; }
  private consume(value: string) { this.skipSpaces(); if (!this.source.startsWith(value, this.position)) return false; this.position += value.length; return true; }
  private skipSpaces() { while (/\s/.test(this.source[this.position] || "")) this.position += 1; }
}

function scientificFunction(name: string, args: number[]) { const unary: Record<string, (value: number) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt, log: Math.log10, ln: Math.log, abs: Math.abs }; if (name === "pow") { if (args.length !== 2) throw new Error("FUNCTION"); return Math.pow(args[0], args[1]); } const operation = unary[name]; if (!operation || args.length !== 1) throw new Error("FUNCTION"); return operation(args[0]); }
function numeric(value: string | undefined) { const parsed = Number(String(value || "").replace(/\s/g, "").replace(",", ".")); if (!Number.isFinite(parsed)) throw new Error("NUMBER"); return parsed; }
function positive(value: string | undefined) { const parsed = numeric(value); if (parsed <= 0) throw new Error("POSITIVE"); return parsed; }
function positiveInteger(value: string | undefined) { return Math.max(1, Math.round(positive(value))); }
function cashFlows(value: string | undefined) { const flows = String(value || "").split(/[;,]/).map((item) => numeric(item.trim())).filter(Number.isFinite); if (!flows.length) throw new Error("CASH_FLOWS"); return flows; }
function formatNumber(value: number, english: boolean) { return new Intl.NumberFormat(english ? "en-GB" : "fr-FR", { maximumFractionDigits: 10 }).format(value); }
function formatExpressionError(error: unknown, english: boolean) { const code = error instanceof Error ? error.message : "INVALID"; if (code === "DIV_ZERO") return english ? "Division by zero is impossible." : "Division par zéro impossible."; if (code === "EMPTY") return english ? "Enter an expression." : "Saisissez une expression."; if (code === "PAREN") return english ? "Check parentheses." : "Vérifiez les parenthèses."; if (code === "FUNCTION") return english ? "Unsupported function or arguments." : "Fonction ou arguments non pris en charge."; return english ? "Invalid expression." : "Expression non valide."; }
function formatFinancialError(error: unknown, english: boolean) { const code = error instanceof Error ? error.message : "NUMBER"; if (code === "CONTRIBUTION") return english ? "Unit price must be higher than unit variable cost." : "Le prix unitaire doit être supérieur au coût variable unitaire."; if (code === "CASH_FLOWS") return english ? "Enter at least one cash flow." : "Saisissez au moins un flux financier."; if (code === "POSITIVE") return english ? "This field must be greater than zero." : "Cette valeur doit être supérieure à zéro."; return english ? "Check the financial inputs." : "Vérifiez les données financières."; }
