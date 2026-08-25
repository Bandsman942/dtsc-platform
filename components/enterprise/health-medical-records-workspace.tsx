"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Archive, CircleHelp, Eye, FilePenLine, Plus, RotateCcw } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { useToastMessage } from "@/components/ui/use-toast-message";
import {
  healthClinicalDateTime,
  healthClinicalStatusLabel,
  healthClinicalT,
  useHealthClinicalLocale,
  type HealthClinicalKey,
  type HealthClinicalLocale,
} from "@/components/enterprise/health-clinical-i18n";

type Patient={id:string;legacyRecordId:string|null;patientNumber:string;fullName:string;phonePrimary:string};
type Permissions={canCreate:boolean;canUpdate:boolean;canArchive:boolean;canManageStructuredItems:boolean;canViewSensitive:boolean;canManageConfidentialNotes:boolean};
type MedicalRecord=Record<string,unknown>&{id:string;recordNumber:string;patientId:string;status:string;confidentialityLevel:string;summary?:string|null;activeProblems?:string|null;riskFactors?:string|null;importantHistorySummary?:string|null;mainAllergiesSummary?:string|null;chronicTreatmentsSummary?:string|null;generalRecommendations?:string|null;followUpNotes?:string|null;activeAlertCount:number;createdAt:string;updatedAt:string;patient:Patient;historyItems?:Item[];allergies?:Item[];currentTreatments?:Item[];alerts?:Item[];confidentialNotes?:Item[];events?:Event[]};
type Item=Record<string,unknown>&{id:string;status:string;createdAt:string;createdBy:{name:string}};
type Event={id:string;eventType:string;summary:string;createdAt:string;actor:{name:string}};
type Consultation={id:string;consultationNumber:string;consultationDate:string;consultationType:string;status:string;priority:string;chiefComplaint:string;finalDiagnosis:string|null;professional:{name:string}};
type LabRequest={id:string;labRequestNumber:string;testLabel:string;status:string;priority:string;requestedAt:string;abnormalityLevel:string|null;resultText:string|null;validatedAt:string|null};
type Dispensation={id:string;quantity:number;dispensedAt:string;billingStatus:string;product:{name:string;productCode:string;unit:string};consultation:{consultationNumber:string}|null;dispensedBy:{name:string}};
type Form=Record<string,string>;
type T=(key:HealthClinicalKey,values?:Record<string,string|number>)=>string;

const SUMMARY_FIELDS=[
  ["summary","medicalRecords.field.summary","medicalRecords.help.summary"],
  ["activeProblems","medicalRecords.field.activeProblems","medicalRecords.help.activeProblems"],
  ["riskFactors","medicalRecords.field.riskFactors","medicalRecords.help.riskFactors"],
  ["importantHistorySummary","medicalRecords.field.importantHistorySummary","medicalRecords.help.importantHistorySummary"],
  ["mainAllergiesSummary","medicalRecords.field.mainAllergiesSummary","medicalRecords.help.mainAllergiesSummary"],
  ["chronicTreatmentsSummary","medicalRecords.field.chronicTreatmentsSummary","medicalRecords.help.chronicTreatmentsSummary"],
  ["generalRecommendations","medicalRecords.field.generalRecommendations","medicalRecords.help.generalRecommendations"],
  ["followUpNotes","medicalRecords.field.followUpNotes","medicalRecords.help.followUpNotes"],
] as const satisfies ReadonlyArray<readonly [string,HealthClinicalKey,HealthClinicalKey]>;

const CONFIDENTIALITY_KEYS={MEDICAL_STANDARD:"medicalRecords.confidentiality.MEDICAL_STANDARD",MEDICAL_RESTRICTED:"medicalRecords.confidentiality.MEDICAL_RESTRICTED",HIGHLY_CONFIDENTIAL:"medicalRecords.confidentiality.HIGHLY_CONFIDENTIAL"} as const;
const CATEGORY_KEYS={MEDICAL:"medicalRecords.category.MEDICAL",SURGICAL:"medicalRecords.category.SURGICAL",FAMILY:"medicalRecords.category.FAMILY",OBSTETRIC:"medicalRecords.category.OBSTETRIC",SOCIAL:"medicalRecords.category.SOCIAL",OTHER:"medicalRecords.category.OTHER"} as const;
const ALLERGY_TYPE_KEYS={MEDICATION:"medicalRecords.allergyType.MEDICATION",FOOD:"medicalRecords.allergyType.FOOD",ENVIRONMENTAL:"medicalRecords.allergyType.ENVIRONMENTAL",CONTACT:"medicalRecords.allergyType.CONTACT",OTHER:"medicalRecords.allergyType.OTHER"} as const;
const SEVERITY_KEYS={MILD:"medicalRecords.severity.MILD",MODERATE:"medicalRecords.severity.MODERATE",SEVERE:"medicalRecords.severity.SEVERE",LIFE_THREATENING:"medicalRecords.severity.LIFE_THREATENING",HIGH:"medicalRecords.severity.HIGH",CRITICAL:"medicalRecords.severity.CRITICAL"} as const;
const ENTITY_KEYS={history:"medicalRecords.entity.history",allergy:"medicalRecords.entity.allergy",treatment:"medicalRecords.entity.treatment",alert:"medicalRecords.entity.alert",confidential_note:"medicalRecords.entity.confidentialNote"} as const;

const emptyForm=():Form=>({patientId:"",confidentialityLevel:"MEDICAL_STANDARD",...Object.fromEntries(SUMMARY_FIELDS.map(([key])=>[key,""]))});
const emptyItem=():Form=>({entity:"history",category:"MEDICAL",label:"",description:"",occurredAt:"",allergen:"",allergyType:"MEDICATION",reaction:"",severity:"MODERATE",medicationName:"",dosage:"",frequency:"",route:"",indication:"",startedAt:"",endedAt:"",alertType:"MEDICAL_RISK",title:"",content:"",visibility:"MEDICAL_TEAM"});

function controlledLabel(locale:HealthClinicalLocale,value:string,map:Readonly<Record<string,HealthClinicalKey>>){
  const key=map[value];
  return key?healthClinicalT(locale,key):value;
}

export function HealthMedicalRecordsWorkspace({organizationId,initialPatientLegacyRecordId}:{organizationId:string;initialPatientLegacyRecordId?:string}) {
  const locale=useHealthClinicalLocale();
  const intlLocale=locale==="en"?"en-US":"fr-FR";
  const t=useCallback<T>((key,values)=>healthClinicalT(locale,key,values),[locale]);
  const initialHandled=useRef("");
  const [records,setRecords]=useState<MedicalRecord[]>([]),[patients,setPatients]=useState<Patient[]>([]),[permissions,setPermissions]=useState<Permissions>({canCreate:false,canUpdate:false,canArchive:false,canManageStructuredItems:false,canViewSensitive:false,canManageConfidentialNotes:false});
  const [loading,setLoading]=useState(true),[message,setMessage]=useState(""),[query,setQuery]=useState(""),[status,setStatus]=useState("");
  useToastMessage(message);
  const [formOpen,setFormOpen]=useState(false),[editing,setEditing]=useState<MedicalRecord|null>(null),[form,setForm]=useState<Form>(()=>emptyForm());
  const [detail,setDetail]=useState<MedicalRecord|null>(null),[consultations,setConsultations]=useState<Consultation[]>([]),[labRequests,setLabRequests]=useState<LabRequest[]>([]),[dispensations,setDispensations]=useState<Dispensation[]>([]),[itemOpen,setItemOpen]=useState(false),[itemForm,setItemForm]=useState<Form>(()=>emptyItem()),[pendingAction,setPendingAction]=useState<{record:MedicalRecord;action:"archive"|"reactivate"}|null>(null),[reason,setReason]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);
    const response=await fetch(`/api/enterprise/${organizationId}/healthcare/medical-records`,{cache:"no-store"});
    const body=await response.json().catch(()=>null) as {records?:MedicalRecord[];patients?:Patient[];permissions?:Permissions;message?:string}|null;
    if(response.ok&&body?.records&&body.patients&&body.permissions){setRecords(body.records);setPatients(body.patients);setPermissions(body.permissions)}
    else setMessage(body?.message||t("medicalRecords.loadFailed"));
    setLoading(false);
  },[organizationId,t]);

  const openDetail=useCallback(async(record:MedicalRecord)=>{
    const response=await fetch(`/api/enterprise/${organizationId}/healthcare/medical-records/${record.id}`,{cache:"no-store"});
    const body=await response.json().catch(()=>null) as {record?:MedicalRecord;consultations?:Consultation[];labRequests?:LabRequest[];pharmacyDispensations?:Dispensation[];message?:string}|null;
    if(response.ok&&body?.record){setDetail(body.record);setConsultations(body.consultations||[]);setLabRequests(body.labRequests||[]);setDispensations(body.pharmacyDispensations||[])}
    else setMessage(body?.message||t("medicalRecords.detailUnavailable"));
  },[organizationId,t]);

  useEffect(()=>{void load()},[load]);
  useEffect(()=>{
    if(!initialPatientLegacyRecordId||initialHandled.current===initialPatientLegacyRecordId||!patients.length)return;
    const patient=patients.find(item=>item.legacyRecordId===initialPatientLegacyRecordId);
    if(patient){
      initialHandled.current=initialPatientLegacyRecordId;
      const existing=records.find(item=>item.patientId===patient.id);
      if(existing)void openDetail(existing);
      else if(permissions.canCreate){setEditing(null);setForm({...emptyForm(),patientId:patient.id});setFormOpen(true)}
    }
  },[initialPatientLegacyRecordId,patients,records,permissions.canCreate,openDetail]);

  const filtered=useMemo(()=>records.filter(item=>{
    const text=`${item.patient.fullName} ${item.patient.patientNumber} ${item.recordNumber}`.toLocaleLowerCase(intlLocale);
    return(!query||text.includes(query.toLocaleLowerCase(intlLocale)))&&(!status||item.status===status);
  }),[records,query,status,intlLocale]);
  const list=useSmartList({items:filtered,pageSize:12,getSearchText:useCallback((item:MedicalRecord)=>`${item.patient.fullName} ${item.patient.patientNumber} ${item.recordNumber}`,[])});

  function change(key:string,value:string){setForm(current=>({...current,[key]:value}))}
  function openCreate(){setEditing(null);setForm(emptyForm());setFormOpen(true)}
  function openEdit(record:MedicalRecord){setEditing(record);setForm({...emptyForm(),...Object.fromEntries(Object.keys(emptyForm()).map(key=>[key,record[key]===null||record[key]===undefined?"":String(record[key])]))});setFormOpen(true)}

  async function save(event:FormEvent){
    event.preventDefault();
    const response=await fetch(editing?`/api/enterprise/${organizationId}/healthcare/medical-records/${editing.id}`:`/api/enterprise/${organizationId}/healthcare/medical-records`,{method:editing?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
    const body=await response.json().catch(()=>null) as {message?:string}|null;
    setMessage(response.ok?(editing?t("medicalRecords.updated"):t("medicalRecords.created")):body?.message||t("medicalRecords.saveFailed"));
    if(response.ok){setFormOpen(false);setDetail(null);await load()}
  }

  async function runRecordAction(){
    if(!pendingAction)return;
    const response=await fetch(`/api/enterprise/${organizationId}/healthcare/medical-records/${pendingAction.record.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:pendingAction.action,reason})});
    const body=await response.json().catch(()=>null) as {message?:string}|null;
    setMessage(response.ok?t("medicalRecords.actionSaved"):body?.message||t("medicalRecords.actionFailed"));
    setPendingAction(null);setReason("");setDetail(null);if(response.ok)await load();
  }

  async function saveItem(event:FormEvent){
    event.preventDefault();if(!detail)return;
    const response=await fetch(`/api/enterprise/${organizationId}/healthcare/medical-records/${detail.id}/items`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(itemForm)});
    const body=await response.json().catch(()=>null) as {message?:string}|null;
    setMessage(response.ok?t("medicalRecords.itemAdded"):body?.message||t("medicalRecords.itemAddFailed"));
    if(response.ok){setItemOpen(false);setItemForm(emptyItem());await openDetail(detail);await load()}
  }

  const statusOptions=useMemo(()=>({ACTIVE:healthClinicalStatusLabel(locale,"ACTIVE"),ARCHIVED:healthClinicalStatusLabel(locale,"ARCHIVED")}),[locale]);

  return <section className="min-w-0 space-y-4 overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 sm:p-5">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="text-xl font-black text-dtsc-ink">{t("medicalRecords.title")}</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-dtsc-muted">{t("medicalRecords.description")}</p></div>
      {permissions.canCreate&&<Button className="w-full bg-[#002b5b] text-white sm:w-auto" onClick={openCreate}><Plus/>{t("medicalRecords.new")}</Button>}
    </div>
    <div className="grid min-w-0 gap-2 sm:grid-cols-2"><Filter label={t("medicalRecords.filter.status")}><Choice value={status} set={setStatus} options={statusOptions} all={t("medicalRecords.allStatuses")}/></Filter></div>
    <ListControls query={query} onQueryChange={setQuery} page={list.page} pageCount={list.pageCount} totalCount={records.length} filteredCount={filtered.length} onPageChange={list.setPage} placeholder={t("medicalRecords.searchPlaceholder")}/>
    {loading?<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1,2,3].map(id=><div key={id} className="h-40 animate-pulse rounded-2xl bg-dtsc-page"/>)}</div>:<div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.paginatedItems.map(record=><RecordCard key={record.id} record={record} permissions={permissions} locale={locale} t={t} detail={openDetail} edit={openEdit} action={action=>setPendingAction({record,action})}/>)}</div>}
    {!loading&&!filtered.length&&(
      <Empty text={t("medicalRecords.empty")}/>
    )}
    <Dialog open={formOpen} onClose={()=>setFormOpen(false)} title={editing?t("medicalRecords.form.editTitle",{number:editing.recordNumber}):t("medicalRecords.form.newTitle")} description={t("medicalRecords.form.description")} className="h-[94dvh] max-w-6xl">
      <form onSubmit={save} className="grid min-w-0 gap-4 overflow-x-hidden">
        <Section title={t("medicalRecords.section.patientConfidentiality")}><Grid>
          <F label={t("medicalRecords.field.patient")} help={t("medicalRecords.help.patient")}><select required disabled={Boolean(editing)} value={form.patientId} onChange={event=>change("patientId",event.target.value)} className={selectClass}><option value="">{t("medicalRecords.selectPatient")}</option>{patients.filter(patient=>editing?.patientId===patient.id||!records.some(record=>record.patientId===patient.id)).map(patient=><option key={patient.id} value={patient.id}>{patient.patientNumber} · {patient.fullName}</option>)}</select></F>
          <F label={t("medicalRecords.field.confidentiality")} help={t("medicalRecords.help.confidentiality")}><Choice value={form.confidentialityLevel} set={value=>change("confidentialityLevel",value)} options={Object.fromEntries(Object.keys(CONFIDENTIALITY_KEYS).map(code=>[code,controlledLabel(locale,code,CONFIDENTIALITY_KEYS)]))}/></F>
        </Grid></Section>
        {SUMMARY_FIELDS.map(([key,labelKey,helpKey])=><F key={key} label={t(labelKey)} help={t(helpKey)}><textarea value={form[key]} onChange={event=>change(key,event.target.value)} className="min-h-24 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm"/></F>)}
        <Button type="submit" className="bg-[#002b5b] text-white">{editing?t("medicalRecords.saveChanges"):t("medicalRecords.create")}</Button>
      </form>
    </Dialog>
    <Dialog open={Boolean(detail)} onClose={()=>setDetail(null)} title={detail?`${detail.recordNumber} · ${detail.patient.fullName}`:t("medicalRecords.detailFallbackTitle")} description={t("medicalRecords.detailDescription")} className="h-[94dvh] max-w-7xl">{detail&&<RecordDetail record={detail} consultations={consultations} labRequests={labRequests} dispensations={dispensations} permissions={permissions} locale={locale} t={t} edit={openEdit} addItem={entity=>{setItemForm({...emptyItem(),entity});setItemOpen(true)}}/>}</Dialog>
    <Dialog open={itemOpen} onClose={()=>setItemOpen(false)} title={t("medicalRecords.itemDialogTitle")} description={t("medicalRecords.itemDialogDescription")} className="h-[90dvh] max-w-3xl"><ItemForm form={itemForm} locale={locale} t={t} set={(key,value)=>setItemForm(current=>({...current,[key]:value}))} save={saveItem} canConfidential={permissions.canManageConfidentialNotes}/></Dialog>
    <Dialog open={Boolean(pendingAction)} onClose={()=>setPendingAction(null)} title={pendingAction?.action==="archive"?t("medicalRecords.action.archiveTitle"):t("medicalRecords.action.reactivateTitle")} description={t("medicalRecords.action.reasonDescription")}><F label={t("medicalRecords.field.reason")} help={t("medicalRecords.help.reason")}><textarea required value={reason} onChange={event=>setReason(event.target.value)} className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-surface p-3"/></F><Button onClick={()=>void runRecordAction()} className="mt-4 bg-[#002b5b] text-white">{t("medicalRecords.confirm")}</Button></Dialog>
  </section>
}

function RecordCard({record,permissions,locale,t,detail,edit,action}:{record:MedicalRecord;permissions:Permissions;locale:HealthClinicalLocale;t:T;detail:(record:MedicalRecord)=>Promise<void>;edit:(record:MedicalRecord)=>void;action:(action:"archive"|"reactivate")=>void}){
  const actions:ActionMenuItem[]=[{key:"detail",label:permissions.canViewSensitive?t("medicalRecords.action.viewRecord"):t("medicalRecords.action.viewAdminSummary"),icon:Eye,onSelect:()=>void detail(record)}];
  if(permissions.canUpdate&&record.status==="ACTIVE")actions.push({key:"edit",label:t("medicalRecords.action.editSummary"),icon:FilePenLine,onSelect:()=>edit(record)});
  if(permissions.canArchive)actions.push(record.status==="ACTIVE"?{key:"archive",label:t("medicalRecords.action.archive"),icon:Archive,destructive:true,onSelect:()=>action("archive")}:{key:"reactivate",label:t("medicalRecords.action.reactivate"),icon:RotateCcw,onSelect:()=>action("reactivate")});
  return <article className="relative min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 pr-14"><div className="absolute right-3 top-3"><ActionMenu items={actions}/></div><div className="flex flex-wrap gap-2"><Badge text={healthClinicalStatusLabel(locale,record.status)}/><Badge text={t("medicalRecords.alertCount",{count:record.activeAlertCount||0})}/></div><button type="button" onClick={()=>void detail(record)} className="mt-3 block min-w-0 text-left"><p className="text-xs font-black uppercase text-cyan-600">{record.recordNumber}</p><h4 className="mt-1 break-words font-black">{record.patient.fullName}</h4><p className="mt-1 text-sm text-dtsc-muted">{record.patient.patientNumber} · {controlledLabel(locale,record.confidentialityLevel,CONFIDENTIALITY_KEYS)}</p><p className="mt-2 text-xs font-bold text-dtsc-muted">{t("medicalRecords.updatedAt",{date:healthClinicalDateTime(record.updatedAt,locale)})}</p></button></article>
}

function RecordDetail({record,consultations,labRequests,dispensations,permissions,locale,t,edit,addItem}:{record:MedicalRecord;consultations:Consultation[];labRequests:LabRequest[];dispensations:Dispensation[];permissions:Permissions;locale:HealthClinicalLocale;t:T;edit:(record:MedicalRecord)=>void;addItem:(entity:string)=>void}){
  return <div className="grid min-w-0 gap-4 overflow-x-hidden">
    {record.alerts?.some(item=>item.status==="ACTIVE")&&<Section title={t("medicalRecords.section.activeAlerts")}><div className="grid gap-2">{record.alerts.filter(item=>item.status==="ACTIVE").map(item=><ItemCard key={item.id} title={String(item.title)} text={String(item.description||t("medicalRecords.noPrecision"))} badge={controlledLabel(locale,String(item.severity),SEVERITY_KEYS)}/>)}</div></Section>}
    <div className="flex flex-wrap gap-2">
      {permissions.canUpdate&&<Button onClick={()=>edit(record)}><FilePenLine/>{t("medicalRecords.action.editSummary")}</Button>}
      {permissions.canManageStructuredItems&&(["history","allergy","treatment","alert"] as const).map(entity=><Button key={entity} variant="outline" onClick={()=>addItem(entity)}><Plus/>{t("medicalRecords.action.addEntity",{entity:t(ENTITY_KEYS[entity])})}</Button>)}
      {permissions.canManageConfidentialNotes&&<Button variant="outline" onClick={()=>addItem("confidential_note")}><Plus/>{t("medicalRecords.action.addEntity",{entity:t(ENTITY_KEYS.confidential_note)})}</Button>}
    </div>
    <Section title={t("medicalRecords.section.summary")}><Grid>{SUMMARY_FIELDS.map(([key,labelKey])=><Info key={key} label={t(labelKey)} value={String(record[key]||t("common.notProvided"))}/>)}</Grid></Section>
    <Collection title={t("medicalRecords.section.history")} emptyText={t("medicalRecords.empty.history")} items={record.historyItems} titleKey="label" textKey="description" locale={locale} t={t}/>
    <Collection title={t("medicalRecords.section.allergies")} emptyText={t("medicalRecords.empty.allergies")} items={record.allergies} titleKey="allergen" textKey="reaction" locale={locale} t={t}/>
    <Collection title={t("medicalRecords.section.treatments")} emptyText={t("medicalRecords.empty.treatments")} items={record.currentTreatments} titleKey="medicationName" textKey="indication" locale={locale} t={t}/>
    <Collection title={t("medicalRecords.section.alerts")} emptyText={t("medicalRecords.empty.alerts")} items={record.alerts} titleKey="title" textKey="description" locale={locale} t={t}/>
    {permissions.canManageConfidentialNotes&&(
      <Collection title={t("medicalRecords.section.confidentialNotes")} emptyText={t("medicalRecords.empty.confidentialNotes")} items={record.confidentialNotes} titleKey="title" textKey="content" locale={locale} t={t}/>
    )}
    <Section title={t("medicalRecords.section.consultations")}><div className="grid gap-2">{consultations.map(item=><ItemCard key={item.id} title={`${item.consultationNumber} · ${item.chiefComplaint}`} text={`${healthClinicalDateTime(item.consultationDate,locale)} · ${item.professional.name}${item.finalDiagnosis?` · ${item.finalDiagnosis}`:""}`} badge={healthClinicalStatusLabel(locale,item.status)}/>)}</div>{!consultations.length&&<Empty text={t("medicalRecords.noConsultations")}/>}</Section>
    <Section title={t("medicalRecords.section.pharmacy")}><div className="grid gap-2">{dispensations.map(item=><ItemCard key={item.id} title={`${item.product.productCode} · ${item.product.name}`} text={`${item.quantity} ${item.product.unit} · ${healthClinicalDateTime(item.dispensedAt,locale)} · ${item.dispensedBy.name}`} badge={healthClinicalStatusLabel(locale,item.billingStatus)}/>)}</div>{!dispensations.length&&<Empty text={t("medicalRecords.noPharmacy")}/>}</Section>
    <Section title={t("medicalRecords.section.laboratory")}><div className="grid gap-2">{labRequests.map(item=><ItemCard key={item.id} title={`${item.labRequestNumber} · ${item.testLabel}`} text={`${healthClinicalDateTime(item.requestedAt,locale)}${item.resultText?` · ${item.resultText}`:""}`} badge={item.abnormalityLevel==="CRITICAL"?t("medicalRecords.resultCritical"):healthClinicalStatusLabel(locale,item.status)}/>)}</div>{!labRequests.length&&<Empty text={t("medicalRecords.noLaboratory")}/>}</Section>
    <Section title={t("medicalRecords.section.recordHistory")}><div className="grid gap-2">{record.events?.map(item=><ItemCard key={item.id} title={`${item.eventType} · ${item.actor.name}`} text={`${item.summary} · ${healthClinicalDateTime(item.createdAt,locale)}`}/>)}</div></Section>
  </div>
}

function ItemForm({form,locale,t,set,save,canConfidential}:{form:Form;locale:HealthClinicalLocale;t:T;set:(key:string,value:string)=>void;save:(event:FormEvent)=>Promise<void>;canConfidential:boolean}){
  const entityOptions=["history","allergy","treatment","alert",...(canConfidential?["confidential_note"]:[])] as string[];
  return <form onSubmit={save} className="grid min-w-0 gap-3">
    <F label={t("medicalRecords.item.type")} help={t("medicalRecords.help.itemType")}><select value={form.entity} onChange={event=>set("entity",event.target.value)} className={selectClass}>{entityOptions.map(entity=><option key={entity} value={entity}>{t(ENTITY_KEYS[entity as keyof typeof ENTITY_KEYS])}</option>)}</select></F>
    {form.entity==="history"&&<><F label={t("medicalRecords.field.category")} help={t("medicalRecords.help.category")}><Choice value={form.category} set={value=>set("category",value)} options={Object.fromEntries(Object.keys(CATEGORY_KEYS).map(code=>[code,controlledLabel(locale,code,CATEGORY_KEYS)]))}/></F><Text name="label" label={t("medicalRecords.field.label")} form={form} set={set} t={t}/><Text name="description" label={t("medicalRecords.field.description")} form={form} set={set} t={t}/></>}
    {form.entity==="allergy"&&<><Text name="allergen" label={t("medicalRecords.field.allergen")} form={form} set={set} t={t}/><F label={t("medicalRecords.field.allergyType")} help={t("medicalRecords.help.allergyType")}><Choice value={form.allergyType} set={value=>set("allergyType",value)} options={Object.fromEntries(Object.keys(ALLERGY_TYPE_KEYS).map(code=>[code,controlledLabel(locale,code,ALLERGY_TYPE_KEYS)]))}/></F><Text name="reaction" label={t("medicalRecords.field.reaction")} form={form} set={set} t={t}/><F label={t("medicalRecords.field.severity")} help={t("medicalRecords.help.allergySeverity")}><Choice value={form.severity} set={value=>set("severity",value)} options={Object.fromEntries(["MILD","MODERATE","SEVERE","LIFE_THREATENING"].map(code=>[code,controlledLabel(locale,code,SEVERITY_KEYS)]))}/></F></>}
    {form.entity==="treatment"&&<><Text name="medicationName" label={t("medicalRecords.field.medicationName")} form={form} set={set} t={t}/><Text name="dosage" label={t("medicalRecords.field.dosage")} form={form} set={set} t={t}/><Text name="frequency" label={t("medicalRecords.field.frequency")} form={form} set={set} t={t}/><Text name="route" label={t("medicalRecords.field.route")} form={form} set={set} t={t}/><Text name="indication" label={t("medicalRecords.field.indication")} form={form} set={set} t={t}/></>}
    {form.entity==="alert"&&<><Text name="title" label={t("medicalRecords.field.alertTitle")} form={form} set={set} t={t}/><Text name="description" label={t("medicalRecords.field.description")} form={form} set={set} t={t}/><F label={t("medicalRecords.field.severity")} help={t("medicalRecords.help.alertSeverity")}><Choice value={form.severity} set={value=>set("severity",value)} options={Object.fromEntries(["MODERATE","HIGH","CRITICAL"].map(code=>[code,controlledLabel(locale,code,SEVERITY_KEYS)]))}/></F></>}
    {form.entity==="confidential_note"&&<><Text name="title" label={t("medicalRecords.field.noteTitle")} form={form} set={set} t={t}/><Text name="content" label={t("medicalRecords.field.confidentialContent")} form={form} set={set} t={t}/></>}
    <Button type="submit" className="bg-[#002b5b] text-white">{t("medicalRecords.addAndHistory")}</Button>
  </form>
}

function Collection({title,emptyText,items,titleKey,textKey,locale,t}:{title:string;emptyText:string;items?:Item[];titleKey:string;textKey:string;locale:HealthClinicalLocale;t:T}){
  return <Section title={title}><div className="grid gap-2">{items?.map(item=><ItemCard key={item.id} title={String(item[titleKey]||title)} text={String(item[textKey]||t("medicalRecords.noPrecision"))} badge={healthClinicalStatusLabel(locale,item.status)}/>)}</div>{!items?.length&&<Empty text={emptyText}/>}</Section>
}
function Text({name,label,form,set,t}:{name:string;label:string;form:Form;set:(key:string,value:string)=>void;t:T}){return <F label={label} help={t("medicalRecords.help.freeText",{label})}><textarea required={!["description","reaction","dosage","frequency","route","indication"].includes(name)} value={form[name]} onChange={event=>set(name,event.target.value)} className="min-h-24 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3"/></F>}
function ItemCard({title,text,badge}:{title:string;text:string;badge?:string}){return <article className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3"><div className="flex flex-wrap gap-2">{badge&&<Badge text={badge}/>}</div><p className="mt-1 break-words font-black">{title}</p><p className="mt-1 break-words text-sm text-dtsc-muted">{text}</p></article>}
function Filter({label,children}:{label:string;children:ReactNode}){return <label className="grid min-w-0 gap-1 text-xs font-black uppercase text-dtsc-muted"><span>{label}</span>{children}</label>}
function F({label,help,children}:{label:string;help:string;children:ReactNode}){return <label className="grid min-w-0 gap-1"><span className="flex items-center gap-1 text-xs font-black uppercase text-dtsc-muted">{label}<span title={help} aria-label={`${label} : ${help}`}><CircleHelp className="h-3.5 w-3.5"/></span></span>{children}</label>}
function Choice({value,set,options,all}:{value:string;set:(value:string)=>void;options:Record<string,string>;all?:string}){return <select value={value} onChange={event=>set(event.target.value)} className={selectClass}>{all&&<option value="">{all}</option>}{Object.entries(options).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>}
function Section({title,children}:{title:string;children:ReactNode}){return <section className="min-w-0 space-y-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4"><h4 className="font-black text-cyan-600">{title}</h4>{children}</section>}
function Grid({children}:{children:ReactNode}){return <div className="grid min-w-0 gap-3 md:grid-cols-2">{children}</div>}
function Info({label,value}:{label:string;value:string}){return <div className="min-w-0 rounded-xl bg-dtsc-surface p-3"><p className="text-xs font-black uppercase text-dtsc-muted">{label}</p><p className="mt-1 break-words text-sm font-bold">{value}</p></div>}
function Empty({text}:{text:string}){return <p className="rounded-xl border border-dashed border-dtsc-border p-4 text-center text-sm text-dtsc-muted">{text}</p>}
function Badge({text}:{text:string}){return <span className="rounded-full bg-cyan-400/15 px-2 py-1 text-xs font-black text-cyan-700">{text}</span>}
const selectClass="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink";
