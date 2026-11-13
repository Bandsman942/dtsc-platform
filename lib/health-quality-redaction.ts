/**
 * Health quality incidents contain descriptions, investigation narratives and
 * event summaries potentially revealing diagnoses. Non-clinical quality
 * dashboards get status, deadline and responsibility only. Both patient and
 * staff confidentiality controls are checked by the calling route.
 */
export function redactHealthQualityIncident<T extends {
  incidentNumber:string; title:string; description:string;
  internalNotes:string|null; witnesses:string|null;
}>(incident:T,canReadClinicalNarrative:boolean):T {
  if(canReadClinicalNarrative)return incident;
  return {
    ...incident,
    title:`Incident qualité · ${incident.incidentNumber}`,
    description:"",
    internalNotes:null,witnesses:null,confidentialityReason:null,
    observedConsequences:null,immediateActions:null,qualificationNotes:null,
    investigationSummary:null,immediateCause:null,rootCause:null,
    contributingFactors:null,investigationConclusion:null,recommendations:null,
    finalConclusion:null,
    events:[],
    correctiveActions:("correctiveActions" in incident&&Array.isArray(incident.correctiveActions))
      ?incident.correctiveActions.map((action:Record<string,unknown>)=>({
        ...action,description:null,implementationNotes:null,validationNotes:null,
        evidenceReference:null,
      }))
      :undefined,
  } as T;
}
