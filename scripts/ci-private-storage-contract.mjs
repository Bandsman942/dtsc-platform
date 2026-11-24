// Loopback-only HTTP test double for the installed Supabase Storage SDK.
// Never serves production traffic, public URLs or arbitrary object paths.
import {createServer} from "node:http";
import {randomUUID} from "node:crypto";
if(process.env.CI!=="true"||process.env.SUPABASE_STORAGE_URL!=="http://127.0.0.1:8089"||!process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY||process.env.SUPABASE_STORAGE_BUCKET!=="dtsc-ci-private")throw new Error("Disposable storage contract configuration required");
const key=process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY,bucket="dtsc-ci-private",objects=new Map();
const json=(res,status,value)=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(value));};
const valid=path=>/^enterprise-bulk\/e2e-erp-professional-org\/bank-statement-import\/[a-zA-Z0-9._-]+$/.test(path);
async function read(req){const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>8*1024*1024)throw new Error("Too large");parts.push(part);}return Buffer.concat(parts);}
createServer(async(req,res)=>{
 try{
  if(req.headers.authorization!=="Bearer "+key)return json(res,401,{message:"Unauthorized"});
  const path=decodeURIComponent(new URL(req.url,"http://127.0.0.1:8089").pathname);
  if(path==="/healthz")return json(res,200,{ok:true});
  const prefix="/storage/v1/object/",raw=path.startsWith(prefix)?path.slice(prefix.length):"";
  const name=raw.replace(/^authenticated\//,"");
  if(req.method==="DELETE"&&name===bucket){
   const body=JSON.parse((await read(req)).toString("utf8"));
   if(!Array.isArray(body.prefixes)||!body.prefixes.every(valid))return json(res,400,{message:"Invalid paths"});
   const removed=body.prefixes.filter(p=>objects.delete(p)).map(name=>({name}));
   return json(res,200,removed);
  }
  if(!name.startsWith(bucket+"/"))return json(res,404,{message:"Not found"});
  const object=name.slice(bucket.length+1);
  if(!valid(object))return json(res,403,{message:"Forbidden"});
  if(req.method==="POST"){
   if(objects.has(object))return json(res,409,{message:"Already exists",statusCode:"409"});
   const data=await read(req);
   JSON.parse(data.toString("utf8"));
   objects.set(object,data);
   return json(res,200,{Key:bucket+"/"+object,Id:randomUUID()});
  }
  if(req.method==="GET"&&objects.has(object)){
   res.writeHead(200,{"content-type":"application/json"});return res.end(objects.get(object));
  }
  return json(res,404,{message:"Not found",statusCode:"404"});
 }catch{return json(res,400,{message:"Invalid test request"});}
}).listen(8089,"127.0.0.1");
