import ExcelJS from "exceljs";
import { assertSafeZip } from "@/lib/enterprise/master-data/catalog-import";
import { physicalCountDenominations,physicalCountRowsSchema,physicalCountTotal } from "@/lib/enterprise/accounting/physical-count";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
type Account={code:string;name:string;currencyCode:string};
export async function buildPhysicalCountXlsx(account:Account,locale:"fr"|"en"){
  const w=new ExcelJS.Workbook();w.creator="DTSC Platform";
  const sheet=w.addWorksheet("Comptage");sheet.columns=[{width:25},{width:25}];
  sheet.addRow(["denomination","quantity"]);
  sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:"FFFFFFFF"}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF087EA4"}};});
  for(const denomination of physicalCountDenominations(account.currencyCode))sheet.addRow([denomination,0]);
  sheet.getColumn(1).numFmt="@";sheet.getColumn(2).numFmt="0";
  sheet.views=[{state:"frozen",ySplit:1}];
  const info=w.addWorksheet("Contexte");info.columns=[{width:25},{width:90}];info.addRow(["accountCode",account.code]);info.addRow(["currencyCode",account.currencyCode]);info.addRow(["name",account.name]);
  info.addRow(["Instructions",locale==="fr"?"Saisir les quantités entières réellement comptées. Ajouter des coupures uniques si nécessaire. Aucun calcul, formule ou lien.":"Enter actual integer quantities. Add unique denominations if needed. No formulas or links."]);
  return Buffer.from(await w.xlsx.writeBuffer());
}
export async function parsePhysicalCountXlsx(file:File,account:Account){
  try{
    if(file.size<=0||file.size>1024*1024||!file.name.toLowerCase().endsWith(".xlsx"))throw Error();
    const bytes=Buffer.from(await file.arrayBuffer());assertSafeZip(bytes);
    const w=new ExcelJS.Workbook();await w.xlsx.load(bytes as unknown as Parameters<typeof w.xlsx.load>[0]);
    const sheet=w.getWorksheet("Comptage"),info=w.getWorksheet("Contexte");
    if(!sheet||!info||sheet.rowCount>51||sheet.columnCount>2||sheet.getCell("A1").value!=="denomination"||sheet.getCell("B1").value!=="quantity"||info.getCell("B1").value!==account.code||info.getCell("B2").value!==account.currencyCode)throw Error();
    const rows=[];
    for(let i=2;i<=sheet.rowCount;i++){
      const denomination=sheet.getCell(i,1).value,quantity=sheet.getCell(i,2).value;
      if(denomination==null&&quantity==null)continue;
      if(!["number","string"].includes(typeof denomination)||!["number","string"].includes(typeof quantity)||String(quantity).trim()==="")throw Error();
      rows.push({denomination:String(denomination).trim(),quantity:Number(quantity)});
    }
    const parsed=physicalCountRowsSchema.parse(rows);
    return {counts:parsed,physicalCount:physicalCountTotal(parsed)};
  }catch{throw new EnterpriseAccountingError("RECONCILIATION_COUNT_ROWS_INVALID",422);}
}
