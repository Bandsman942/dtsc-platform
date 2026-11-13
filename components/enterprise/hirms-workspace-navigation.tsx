"use client";
import Link from "next/link";
import { ClipboardCheck, FileJson2, ScanLine, Settings2 } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import type { HirmsEnvironment } from "@/lib/enterprise/health-insurance-connectors/environments";

export type HirmsWorkspaceSection = "connectors" | "verify" | "invoices" | "ocr";
const sections: Array<{
  key: HirmsWorkspaceSection;
  path: string;
  fr: string; en: string;
  icon: typeof Settings2;
}> = [
  {key:"connectors",path:"connectors",fr:"Configuration",en:"Configuration",icon:Settings2},
  {key:"verify",path:"verify",fr:"Adhérents",en:"Members",icon:ClipboardCheck},
  {key:"invoices",path:"invoices",fr:"Factures HSL",en:"HSL invoices",icon:FileJson2},
  {key:"ocr",path:"ocr",fr:"Documents OCR",en:"OCR documents",icon:ScanLine},
];

export function HirmsWorkspaceNavigation({active,environment}:{
  active:HirmsWorkspaceSection; environment:HirmsEnvironment;
}) {
  const en=useAppLocale()==="en";
  return (
    <nav aria-label={en?"Health insurance module navigation":"Navigation assurances santé"} className="-mx-1 min-w-0 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:thin]">
      <div className="flex min-w-max gap-1.5 border-b border-dtsc-border pb-2">
        {sections.map(item=>{
          const Icon=item.icon;
          const selected=item.key===active;
          return <Link key={item.key} href={`/enterprise-insurance/${item.path}?environment=${environment}`}
            aria-current={selected?"page":undefined}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 sm:text-sm ${selected
              ?"border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
              :"border-dtsc-border bg-dtsc-surface text-dtsc-ink hover:bg-dtsc-page"}`}>
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0"/>{en?item.en:item.fr}
          </Link>;
        })}
      </div>
    </nav>
  );
}
