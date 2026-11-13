export async function downloadHirmsCsv(url:string,filename:string) {
  const response = await fetch(url,{cache:"no-store",credentials:"same-origin"});
  if (!response.ok) throw new Error("HIRMS_EXPORT_FAILED");
  const blob = await response.blob();
  const contentDisposition = response.headers.get("Content-Disposition") || "";
  const offeredName = /filename="(DTSC-HIRMS-[A-Za-z0-9_.-]+[.](?:xlsx|xls|json|csv))"/.exec(contentDisposition)?.[1];
  const href = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = href;
    link.download = offeredName || filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(href);
  }
}
export function hirmsHistoryParams(environment:string,page:number,filters:{
  search:string;status:string;from:string;to:string;
},format:"json"|"csv"="json") {
  const params = new URLSearchParams({environment,page:String(page)});
  for(const field of ["search","status","from","to"] as const){
    if(filters[field])params.set(field,filters[field].trim());
  }
  if(format==="csv")params.set("format","csv");
  return params.toString();
}
