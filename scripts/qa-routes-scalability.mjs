import fs from "node:fs";
import path from "node:path";

// ROUTES-01: deterministic source routing inventory. Never claim that the
// source-file count equals the Vercel deployment routing-rule count.
const root = process.cwd();
const baselinePath = path.join(root, "docs/routing/route-budget-baseline.json");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
function listFiles(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(file, found);
    else if (entry.isFile()) found.push(path.relative(root,file).split(path.sep).join("/"));
  }
  return found;
}
function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
const paths = listFiles(path.join(root,"app"));
const pages = paths.filter(p=>/(^|\/)page\.(tsx?|jsx?)$/.test(p));
const handlers = paths.filter(p=>/(^|\/)route\.(tsx?|jsx?)$/.test(p));
const api = handlers.filter(p=>p.startsWith("app/api/"));
const groupCounts = new Map();
for (const p of api) {
  const pieces=p.split("/");
  const group=pieces[2] === "enterprise" ? "enterprise/" + (pieces[4] || "root") : pieces[2] || "root";
  groupCounts.set(group,(groupCounts.get(group)||0)+1);
}
const nextAppPaths = readJsonIfExists(path.join(root,".next/server/app-paths-manifest.json"));
const nextRoutes = readJsonIfExists(path.join(root,".next/routes-manifest.json"));
const vercelOutput = readJsonIfExists(path.join(root,".vercel/output/config.json"));
const actualRules = Array.isArray(vercelOutput?.routes) ? vercelOutput.routes.length : null;
const sourceTotal=pages.length+handlers.length;
const report={
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  baselineCommit:baseline.sourceCommit,
  baselineSourceFiles:baseline.source.total,
  currentSourceFiles:sourceTotal,
  freedSourceFiles:baseline.source.total-sourceTotal,
  pages:pages.length,
  routeHandlers:handlers.length,
  apiHandlers:api.length,
  enterpriseApiHandlers:api.filter(p=>p.startsWith("app/api/enterprise/")).length,
  groupCounts:Object.fromEntries([...groupCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,30)),
  buildArtifacts:{
    nextAppPathsCount:nextAppPaths?Object.keys(nextAppPaths).length:null,
    nextRedirectsCount:nextRoutes?.redirects?.length??null,
    nextRewritesCount:nextRoutes?.rewrites?(
      Array.isArray(nextRoutes.rewrites)?nextRoutes.rewrites.length:Object.values(nextRoutes.rewrites).reduce((sum,r)=>sum+(Array.isArray(r)?r.length:0),0)
    ):null,
    vercelOutputRuleCount:actualRules,
    vercelOutputAvailable:actualRules!==null,
  },
  evidenceLevel:actualRules!==null?"VERCEL_OUTPUT_CONFIG":"SOURCE_AND_NEXT_BUILD_ONLY",
  // Neither .next route manifests nor Vercel Project Routes API (routing-layer
  // rules) proves the final effective deployment rule count.
  productionDeploymentStateAtBaseline:baseline.buildEvidence.productionState,
  productionEffectiveRuleCount:"UNVERIFIED",
};
const target=path.join(root,"artifacts/routing/route-budget.json");
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.writeFileSync(target,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
if(process.argv.includes("--assert")){
  const errors=[];
  if(sourceTotal>baseline.policy.maxSourceRouteFiles)errors.push("Too many source routes: "+sourceTotal);
  if(report.freedSourceFiles<baseline.policy.minFreedFromBaseline)errors.push("Insufficient consolidated routes: "+report.freedSourceFiles);
  if(actualRules!==null && actualRules>baseline.policy.maximumVercelBuildOutputRules)errors.push("Vercel output config routes exceed "+baseline.policy.maximumVercelBuildOutputRules);
  if(errors.length){console.error("ROUTES-01 failed: "+errors.join("; "));process.exitCode=1;}
  else console.log("ROUTES-01 source budget passed; final Vercel routing still requires Production verification.");
}
if(process.argv.includes("--require-vercel-output") && actualRules===null){
  console.error("Vercel output config is missing; cannot claim an exact rule count.");
  process.exitCode=1;
}
