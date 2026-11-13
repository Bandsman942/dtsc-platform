import assert from "node:assert/strict";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

function harness(initialItems=[
  {id:"exam-a",testLabel:"Glycémie",resultText:null,unit:"mg/dL",referenceRange:"70–100",status:"ANALYZING"},
  {id:"exam-b",testLabel:"Créatinine",resultText:null,unit:"mg/L",referenceRange:"5–12",status:"ANALYZING"},
]){
  const organizationId="test-org";
  let request={id:"request-1",organizationId,status:"ANALYZING",legacyRecordId:"legacy-1",
    resultText:null,resultUnit:null,referenceRange:null,resultInterpretation:null,abnormalityLevel:null};
  let items=initialItems.map(x=>({...x,labRequestId:request.id,organizationId}));
  let events=[];
  let staleUpdate=false;
  let isolation=null;
  const database={
    healthLabRequest:{
      findFirst:async ({where})=>where.organizationId===organizationId&&where.id===request.id?{...request}:null,
    },
    $transaction:async (callback,options)=>{
      isolation=options?.isolationLevel;
      const previous=structuredClone({request,items,events});
      const tx={
        healthLabRequestItem:{
          findMany:async ({where})=>where.organizationId===organizationId&&where.labRequestId===request.id?items.map(x=>({...x})):[],
          update:async ({where,data})=>{const x=items.find(row=>row.id===where.id);if(!x)throw Error("NOT_FOUND");Object.assign(x,data);return {...x}},
          updateMany:async ({where,data})=>{let n=0;for(const x of items){if(x.organizationId===where.organizationId&&x.labRequestId===where.labRequestId){Object.assign(x,data);n++}}return {count:n}},
        },
        healthLabRequest:{
          updateMany:async ({where,data})=>{if(staleUpdate||where.organizationId!==organizationId||where.status!==request.status)return {count:0};Object.assign(request,data);return {count:1}},
          findFirstOrThrow:async ({where})=>{assert.equal(where.organizationId,organizationId);return {...request}},
        },
        enterpriseSectorRecord:{updateMany:async()=>({count:1})},
        healthLabEvent:{create:async ({data})=>{events.push({...data});return data}},
      };
      try{return await callback(tx)}catch(error){({request,items,events}=previous);throw error}
    },
  };
  const load=workflowTestLoader({
    "@/lib/prisma":{prisma:database},
    "@/lib/health-staff":{validateAssignableHealthProfessional:async()=>true},
  });
  const action=load("@/lib/health-laboratory").actionHealthLabRequest;
  return {
    action:(data,org=organizationId)=>action(org,request.id,"lab-user",data),
    state:()=>structuredClone({request,items,events,isolation}),
    stale:()=>{staleUpdate=true},
  };
}
function result(itemId,value,unit,referenceRange){
  return {itemId,resultText:value,unit,referenceRange,interpretation:"",
    abnormalityLevel:"NORMAL"};
}
const h=harness();
let state;
await h.action({action:"enter_result",itemResults:[
  result("exam-a","90","mg/dL","70–100"),
  result("exam-b","1.1","mg/L","5–12"),
]});
state=h.state();
assert.equal(state.isolation,"Serializable","Laboratory result updates must be serializable");
assert.equal(state.request.status,"PENDING_VALIDATION");
assert.equal(state.request.resultText,null,"No ambiguous parent result when request has multiple tests");
assert.equal(state.items[0].resultText,"90");
assert.equal(state.items[1].resultText,"1.1");
assert.notEqual(state.items[0].unit,state.items[1].unit);
await h.action({action:"validate_result"});
state=h.state();
assert.equal(state.request.status,"VALIDATED");
assert.ok(state.request.validatedById);
assert.ok(state.items.every(x=>x.resultText));
await h.action({action:"correct_result",reason:"Correction analytique motivée"});
state=h.state();
assert.equal(state.request.status,"PENDING_VALIDATION");
assert.equal(state.request.validatedById,null);
assert.equal(state.items[0].resultText,"90","Correction must preserve previous results until safely replaced");
assert.equal(state.items[1].resultText,"1.1");
const before=h.state();
await assert.rejects(h.action({action:"enter_result",itemResults:[result("exam-a","91","mg/dL","70–100")]}),/RESULT_ITEMS_INCOMPLETE/);
assert.deepEqual(h.state(),before,"Incomplete result set must not mutate data");
await assert.rejects(h.action({action:"enter_result",itemResults:[
  result("exam-a","91","mg/dL","70–100"),
  result("another-tenant","1.3","mg/L","5–12"),
]}),/RESULT_ITEM_INVALID/);
assert.deepEqual(h.state(),before,"Foreign item must not mutate data");
await assert.rejects(h.action({action:"enter_result",itemResults:[
  result("exam-a","91","mg/dL","70–100"),
  result("exam-a","91","mg/dL","70–100"),
]}),/RESULT_ITEMS_INCOMPLETE/);
assert.deepEqual(h.state(),before,"Duplicate result item IDs must not mutate data");
await assert.rejects(h.action({action:"enter_result",itemResults:[
  result("exam-a","91","mg/dL","70–100"),
  result("exam-b","1.3","mg/L","5–12"),
]},"other-tenant"),/NOT_FOUND/);
assert.deepEqual(h.state(),before,"Cross-tenant request must not mutate data");
h.stale();
await assert.rejects(h.action({action:"enter_result",itemResults:[
  result("exam-a","91","mg/dL","70–100"),
  result("exam-b","1.3","mg/L","5–12"),
]}),/STATE_CHANGED/);
assert.deepEqual(h.state(),before,"Concurrent status change must rollback");
const single=harness([{id:"single",testLabel:"Glycémie",resultText:null,status:"ANALYZING"}]);
await single.action({action:"enter_result",resultText:"95",resultUnit:"mg/dL"});
assert.equal(single.state().items[0].resultText,"95","Legacy one-test contract must remain functional");
assert.equal(single.state().request.resultText,"95");
await single.action({action:"validate_result"});
assert.equal(single.state().request.status,"VALIDATED");
console.log("✅ HEALTH-01 comportement labo : deux tests indépendants, sécurité tenant, erreurs atomiques, correction, concurrence, legacy unitaire");
