type DecimalText = string | number;
export type StatementBalanceInput = {
  periodStart: Date; periodEnd: Date; openingBalance: DecimalText; closingBalance: DecimalText;
  lines: Array<{transactionDate:Date; debit:DecimalText; credit:DecimalText; runningBalance?:DecimalText; reference?:string|null; description:string; counterparty?:string|null}>;
};
export type BankBalanceIssue = {field:string; line?:number; code:string};
function units(value:DecimalText):bigint {
  const raw=String(value);
  if(!/^-?\d{1,14}(\.\d{1,6})?$/.test(raw)) throw new Error("BANK_STATEMENT_AMOUNT_INVALID");
  const negative=raw.startsWith("-");
  const [whole,fraction=""]=raw.replace(/^-/,"").split(".");
  const magnitude=BigInt(whole)*BigInt(1000000)+BigInt(fraction.padEnd(6,"0"));
  return negative?-magnitude:magnitude;
}
/** Exact monetary continuity for normalized imports, before any staging or persistence. */
export function bankStatementBalanceIssues(input:StatementBalanceInput):BankBalanceIssue[] {
  const issues:BankBalanceIssue[]=[];
  if(input.periodStart>input.periodEnd) issues.push({field:"periodEnd",code:"BANK_STATEMENT_PERIOD_INVALID"});
  let running:bigint;
  let closing:bigint;
  try{running=units(input.openingBalance);closing=units(input.closingBalance);}catch{return [{field:"closingBalance",code:"BANK_STATEMENT_AMOUNT_INVALID"}];}
  const seen=new Set<string>();
  let previousDate:Date|null=null;
  for(let i=0;i<input.lines.length;i++){
    const line=input.lines[i],lineNumber=i+1;
    if(line.transactionDate<input.periodStart || line.transactionDate>input.periodEnd) issues.push({field:"transactionDate",line:lineNumber,code:"BANK_STATEMENT_LINE_OUTSIDE_PERIOD"});
    if(previousDate && line.transactionDate<previousDate) issues.push({field:"transactionDate",line:lineNumber,code:"BANK_STATEMENT_LINE_ORDER_INVALID"});
    previousDate=line.transactionDate;
    try{
      const debit=units(line.debit),credit=units(line.credit);
      if(debit<BigInt(0)||credit<BigInt(0)||(debit>BigInt(0))===(credit>BigInt(0))){issues.push({field:"debit",line:lineNumber,code:"BANK_STATEMENT_LINE_DIRECTION_INVALID"});continue;}
      running+=credit-debit;
      if(line.runningBalance!==undefined && units(line.runningBalance)!==running) issues.push({field:"runningBalance",line:lineNumber,code:"BANK_STATEMENT_RUNNING_BALANCE_MISMATCH"});
      if(line.reference?.trim()){
        const key=JSON.stringify([line.transactionDate.toISOString(),line.reference.trim(),debit.toString(),credit.toString(),line.description.trim(),line.counterparty?.trim()||""]);
        if(seen.has(key)) issues.push({field:"reference",line:lineNumber,code:"BANK_STATEMENT_DUPLICATE_LINE"});
        seen.add(key);
      }
    }catch{issues.push({field:"debit",line:lineNumber,code:"BANK_STATEMENT_AMOUNT_INVALID"});}
    if(issues.length>=50) break;
  }
  if(running!==closing) issues.push({field:"closingBalance",code:"BANK_STATEMENT_CLOSING_BALANCE_MISMATCH"});
  return issues;
}
