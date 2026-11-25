import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function execute(file,bindings={}){
  const exports={};
  const code=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:id=>{assert.ok(id in bindings,id);return bindings[id];}},{filename:file});
  return exports;
}
const finance=execute("lib/enterprise/finance-user-guides.ts");
const canonical=execute("lib/user-guides/canonical-guide.ts");
const registry=execute("lib/user-guides/enterprise-guide-registry.ts",{
  "@/lib/enterprise/finance-user-guides":finance,
  "@/lib/enterprise/education-user-guides":{EDUCATION_USER_GUIDES:{}},
  "@/lib/enterprise/sector-user-guides":{SECTOR_USER_GUIDES:{}},
  "@/lib/user-guides/canonical-guide":canonical,
});
for(const code of ["FINANCE_CASH","FINANCE_BANK","FINANCE_TREASURY","FINANCE_RECONCILIATION"]){
  const fr=registry.getCanonicalEnterpriseUserGuide(code,"fr"),en=registry.getCanonicalEnterpriseUserGuide(code,"en");
  assert.equal(fr.code,code);assert.equal(en.code,code);
  assert.equal(en.updatedAt,"2026-11-25");assert.equal(fr.updatedAt,en.updatedAt);
  assert.notEqual(fr.title,en.title);assert.notEqual(fr.summary,en.summary);
  assert.equal(en.steps.length,5);
  assert.ok(en.steps.every(step=>step.actions.length>0));
  assert.doesNotMatch(JSON.stringify(en),/Vérifiez|Touchez|clôture|rapprochement|Préparé|une session|les écarts/);
}
const cash=registry.getCanonicalEnterpriseUserGuide("FINANCE_CASH","en");
assert.match(JSON.stringify(cash),/independent.*reviewer|reviewer.*independent/);
assert.match(JSON.stringify(cash),/no extra movement or journal/);
const retail=execute("lib/user-guides/retail-telco-mobile-money-guides.ts");
for(const locale of ["fr","en"]){
  const guide=retail.getRetailUserGuide("RETAIL_DAILY_CLOSE",locale);
  assert.equal(guide.code,"RETAIL_DAILY_CLOSE");assert.equal(guide.updatedAt,"2026-11-25");
  assert.doesNotMatch(JSON.stringify(guide),/Approved variances are posted|écarts approuvés sont postés|Posting Finance des écarts approuvés/);
}
console.log("#1226 native guides: four complete Finance FR/EN variants and bilingual store close preserve independent qualification");
