import { z } from "zod";

export const physicalCountRowsSchema=z.array(z.object({denomination:z.string().regex(/^\d{1,14}(\.\d{1,6})?$/),quantity:z.number().int().min(0).max(1000000000)})).min(1).max(50);
export type PhysicalCountRows=z.infer<typeof physicalCountRowsSchema>;
export function physicalCountTotal(rows:PhysicalCountRows):string {
  const parsed=physicalCountRowsSchema.parse(rows);
  const scale=BigInt(1000000);
  let total=BigInt(0);
  const seen=new Set<string>();
  for(const row of parsed){
    const [whole,fraction=""]=row.denomination.split(".");
    const units=BigInt(whole)*scale+BigInt(fraction.padEnd(6,"0"));
    if(units<=BigInt(0)||seen.has(units.toString()))throw new Error("RECONCILIATION_COUNT_ROWS_INVALID");
    seen.add(units.toString());
    total+=units*BigInt(row.quantity);
  }
  if(total>=BigInt("100000000000000000000"))throw new Error("RECONCILIATION_COUNT_ROWS_INVALID");
  const fraction=(total%scale).toString().padStart(6,"0").replace(/0+$/,"");
  return (total/scale).toString()+(fraction?"."+fraction:"");
}
export function physicalCountDenominations(currency:string):string[]{
  if(currency==="CDF")return ["20000","10000","5000","1000","500","200","100","50"];
  if(currency==="USD")return ["100","50","20","10","5","1","0.25","0.10","0.05","0.01"];
  return ["100","50","20","10","5","1"];
}
