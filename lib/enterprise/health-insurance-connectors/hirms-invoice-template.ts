import { prisma } from "@/lib/prisma";
import { openHirmsCredentials } from "./crypto";
import { hirmsEndpoints, assertHirmsEnvironmentEnabled, type HirmsEnvironment } from "./environments";
import { getHirmsAccessToken } from "./hirms";
import { InsuranceConnectorError } from "./registry";

const TEMPLATE_MAX_BYTES = 2 * 1024 * 1024;
const allowedMimes: Array<{prefix:string;extension:string;mime:string}> = [
  {prefix:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",extension:"xlsx",mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
  {prefix:"application/vnd.ms-excel",extension:"xls",mime:"application/vnd.ms-excel"},
  {prefix:"text/csv",extension:"csv",mime:"text/csv; charset=utf-8"},
  {prefix:"application/json",extension:"json",mime:"application/json"},
  {prefix:"text/plain",extension:"csv",mime:"text/csv; charset=utf-8"},
];
/** Download only the official HSL template; no client-provided URL or secret leaves the server. */
export async function downloadOfficialHirmsInvoiceTemplate(organizationId:string,environment:HirmsEnvironment) {
  assertHirmsEnvironmentEnabled(environment,organizationId);
  const connector=await prisma.enterpriseHealthInsuranceConnector.findUnique({
    where:{organizationId_adapterCode_environment:{organizationId,adapterCode:"HIRMS_HSL",environment}},
    select:{status:true,credentialsEncrypted:true},
  });
  if(connector?.status!=="READY"||!connector.credentialsEncrypted)
    throw new InsuranceConnectorError("HIRMS_CONNECTOR_NOT_READY",409);
  const credentials=openHirmsCredentials(connector.credentialsEncrypted);
  const url=hirmsEndpoints(environment).api+"/api/invoices/standard-template";
  const request=async(force=false)=>{
    const token=await getHirmsAccessToken(credentials,environment,organizationId,force);
    try{
      return await fetch(url,{method:"GET",cache:"no-store",signal:AbortSignal.timeout(15000),
        headers:{Authorization:`Bearer ${token}`,Accept:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv, application/json"}});
    }catch{throw new InsuranceConnectorError("HIRMS_TEMPLATE_UNREACHABLE",503);}
  };
  let response=await request();
  if(response.status===401)response=await request(true);
  if(response.status===401||response.status===403)throw new InsuranceConnectorError("HIRMS_UPLOAD_INVOICES_NOT_GRANTED",403);
  if(response.status===429)throw new InsuranceConnectorError("HIRMS_RATE_LIMITED",429);
  if(!response.ok)throw new InsuranceConnectorError("HIRMS_TEMPLATE_UNAVAILABLE",502);
  const declared=response.headers.get("content-type")?.split(";")[0].trim().toLowerCase()||"";
  const format=allowedMimes.find(item=>declared===item.prefix);
  if(!format)throw new InsuranceConnectorError("HIRMS_TEMPLATE_FORMAT_UNRECOGNIZED",502);
  if(Number(response.headers.get("content-length")||0)>TEMPLATE_MAX_BYTES)
    throw new InsuranceConnectorError("HIRMS_TEMPLATE_TOO_LARGE",413);
  const body=await response.arrayBuffer();
  if(body.byteLength===0||body.byteLength>TEMPLATE_MAX_BYTES)
    throw new InsuranceConnectorError("HIRMS_TEMPLATE_TOO_LARGE",413);
  return {body,mime:format.mime,filename:`DTSC-HIRMS-modele-officiel-${environment}.${format.extension}`};
}
