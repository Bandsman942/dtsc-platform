import ExcelJS from "exceljs";
import { assertSafeZip } from "@/lib/enterprise/master-data/catalog-import";
import { formatEnterpriseBusinessDate } from "@/lib/enterprise/business-context";
import { isValidEnterpriseActivityCivilDate } from "@/lib/enterprise/enterprise-activity-civil-date";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
export const BANK_STATEMENT_COLUMNS = ["transactionDate","valueDate","description","reference","counterparty","debit","credit","runningBalance"] as const;
type Locale="fr"|"en";
export async function buildBankStatementXlsx(locale:Locale,account?:{code:string;name:string;currencyCode:string;accountType?:string}){
  const workbook=new ExcelJS.Workbook();workbook.creator="DTSC Platform";
  const sheet=workbook.addWorksheet("Données");
  sheet.columns=BANK_STATEMENT_COLUMNS.map(key=>({key,width:key==="description"?40:key==="reference"||key==="counterparty"?26:20}));
  sheet.addRow([...BANK_STATEMENT_COLUMNS]);
  sheet.getRow(1).height=26;
  sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:"FFFFFFFF"}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF087EA4"}};cell.alignment={vertical:"middle"};});
  sheet.views=[{state:"frozen",ySplit:1}];sheet.autoFilter={from:"A1",to:"H1"};
  for(const col of ["A","B","D","E"]) sheet.getColumn(col).numFmt="@";
  for(const col of ["F","G","H"]) sheet.getColumn(col).numFmt="0.00####";
  const help=workbook.addWorksheet("Instructions");help.columns=[{width:28},{width:85}];
  const tr=(fr:string,en:string)=>locale==="fr"?fr:en;
  help.addRow([tr("Compte sélectionné","Selected account"),account?account.code+" · "+account.name:tr("À choisir dans DTSC","Select in DTSC")]);
  help.addRow([tr("Devise","Currency"),account?.currencyCode||tr("Devise du compte","Account currency")]);
  if(account?.accountType==="MOBILE_MONEY"){
    help.addRow([tr("Relevé opérateur","Operator statement"),tr("Utilisez la référence unique de transaction opérateur et le solde du portefeuille. Dépôts, retraits, commissions et frais selon leur sens réel sur le float.","Use the unique operator transaction reference and wallet balance. Cash-in, cash-out, commissions and fees follow their actual float direction.")]);
    help.addRow([tr("Attention","Important"),tr("Ne pas mélanger espèces et float opérateur ni plusieurs devises ou comptes.","Do not combine physical cash with operator float, currencies or accounts.")]);
  }
  help.addRow([tr("Dates","Dates"),"YYYY-MM-DD"]);
  help.addRow([tr("Ordre","Order"),tr("Date croissante, ordre du relevé à date égale.","Ascending date, statement order for equal dates.")]);
  help.addRow([tr("Débit / crédit","Debit / credit"),tr("Une seule valeur positive par ligne, du point de vue du titulaire.","One positive value per row, from the account holder’s perspective.")]);
  help.addRow([tr("Solde courant","Running balance"),tr("Facultatif; doit être égal au solde précédent + crédit − débit.","Optional; must equal previous balance + credit − debit.")]);
  help.addRow([tr("Sécurité","Security"),tr("Pas de formule, lien, macro ni exemple à importer. Maximum 10 000 lignes / 2 Mo.","No formulas, links, macros or sample data. Maximum 10,000 rows / 2 MB.")]);
  help.getRow(1).font={bold:true};return Buffer.from(await workbook.xlsx.writeBuffer());
}
function text(value:ExcelJS.CellValue):string{
  if(value===null||value===undefined)return "";
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return formatEnterpriseBusinessDate(value,"UTC");
  if(typeof value==="number"&&Number.isFinite(value))return String(value);
  if(typeof value==="string")return value.trim();
  throw new EnterpriseAccountingError("BANK_STATEMENT_UNSAFE_CELL",422);
}
export async function parseBankStatementXlsx(file:File){
  if(file.size<=0||file.size>2*1024*1024||!file.name.toLowerCase().endsWith(".xlsx"))throw new EnterpriseAccountingError("BANK_STATEMENT_FILE_INVALID",422);
  const buffer=Buffer.from(await file.arrayBuffer());
  try{assertSafeZip(buffer);}catch{throw new EnterpriseAccountingError("BANK_STATEMENT_FILE_INVALID",422);}
  const workbook=new ExcelJS.Workbook();
  try{await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);}catch{throw new EnterpriseAccountingError("BANK_STATEMENT_FILE_INVALID",422);}
  const sheet=workbook.getWorksheet("Données")||workbook.getWorksheet("Data");
  if(!sheet||sheet.rowCount>10001||sheet.columnCount>8)throw new EnterpriseAccountingError("BANK_STATEMENT_FILE_INVALID",422);
  if(BANK_STATEMENT_COLUMNS.some((key,index)=>text(sheet.getCell(1,index+1).value)!==key))throw new EnterpriseAccountingError("BANK_STATEMENT_TEMPLATE_COLUMNS_INVALID",422);
  const rows:Array<{transactionDate:string;valueDate?:string;description:string;reference?:string;counterparty?:string;debit:string;credit:string;runningBalance?:string}>=[];
  for(let row=2;row<=sheet.rowCount;row++){
    const cells=BANK_STATEMENT_COLUMNS.map((_,i)=>text(sheet.getCell(row,i+1).value));
    if(!cells.some(Boolean))continue;
    const [date,valueDate,description,reference,counterparty,debit,credit,balance]=cells;
    if(!isValidEnterpriseActivityCivilDate(date)||(valueDate&&!isValidEnterpriseActivityCivilDate(valueDate))||!description||description.length>500||reference.length>200||counterparty.length>200)throw new EnterpriseAccountingError("BANK_STATEMENT_ROW_INVALID",422,{row});
    if([description,reference,counterparty].some(value=>/^[=+@]|^-[^\d]/.test(value)))throw new EnterpriseAccountingError("BANK_STATEMENT_UNSAFE_CELL",422,{row});
    const normalized=(value:string)=>value.replace(/\s/g,"").replace(",",".");
    if([debit||"0",credit||"0",...(balance?[balance]:[])].some(value=>! /^-?\d{1,14}(\.\d{1,6})?$/.test(normalized(value))))throw new EnterpriseAccountingError("BANK_STATEMENT_ROW_INVALID",422,{row});
    rows.push({transactionDate:date,valueDate:valueDate||undefined,description,reference:reference||undefined,counterparty:counterparty||undefined,debit:normalized(debit||"0"),credit:normalized(credit||"0"),runningBalance:balance?normalized(balance):undefined});
  }
  if(!rows.length)throw new EnterpriseAccountingError("BANK_STATEMENT_ROW_INVALID",422);
  return rows;
}
