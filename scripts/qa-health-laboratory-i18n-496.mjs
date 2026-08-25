import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root,file),"utf8").replace(/\r\n/g,"\n");
const fr = JSON.parse(read("locales/health-laboratory.fr.json"));
const en = JSON.parse(read("locales/health-laboratory.en.json"));
const helper = read("components/enterprise/health-clinical-i18n.ts");
const workspace = read("components/enterprise/health-laboratory-workspace.tsx");
const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS ${label}`);
  else { failures.push(label); console.error(`FAIL ${label}`); }
}
function containsAll(source, patterns) { return patterns.every((pattern)=>source.includes(pattern)); }

const frKeys = Object.keys(fr).sort();
const enKeys = Object.keys(en).sort();
check("Laboratoire #496: catalogues FR/EN complets", frKeys.length === 207 && enKeys.length === 207);
check("Laboratoire #496: symétrie exacte des clés FR/EN", JSON.stringify(frKeys) === JSON.stringify(enKeys));
check("Laboratoire #496: valeurs FR/EN définies", [...Object.values(fr),...Object.values(en)].every((value)=>typeof value === "string" && value.trim().length > 0));
check("Laboratoire #496: helper clinique enregistre les deux catalogues", containsAll(helper,[
  'laboratoryFr from "@/locales/health-laboratory.fr.json"',
  'laboratoryEn from "@/locales/health-laboratory.en.json"',
  "...laboratoryFr",
  "...laboratoryEn",
]));
check("Laboratoire #496: workspace utilise la locale clinique canonique", containsAll(workspace,[
  "useHealthClinicalLocale",
  "healthClinicalT",
  "healthClinicalDateTime",
  'locale === "en" ? "en-US" : "fr-FR"',
  "toLocaleLowerCase(intlLocale)",
]));
check("Laboratoire #496: codes contrôlés localisés par clés sémantiques", containsAll(workspace,[
  "STATUS_KEYS",
  "PRIORITY_KEYS",
  "SAMPLE_KEYS",
  "QUALITY_KEYS",
  "ABNORMALITY_KEYS",
  "CATEGORY_KEYS",
  "CONFIDENTIALITY_KEYS",
  "ACTION_TITLE_KEYS",
  '"lab.status.DRAFT"',
  '"lab.priority.CRITICAL"',
  '"lab.sample.BLOOD"',
  '"lab.quality.COMPLIANT"',
  '"lab.abnormality.CRITICAL"',
  '"lab.category.HEMATOLOGY"',
  '"lab.confidentiality.HIGHLY_CONFIDENTIAL"',
]));
check("Laboratoire #496: catalogue métier sélectionné selon la locale avec fallback", containsAll(workspace,[
  "function catalogLabel",
  "item.labelEn || item.labelFr",
  "item.labelFr || item.labelEn || item.code",
  "catalogLabel(locale,item)",
]));
check("Laboratoire #496: données cliniques et résultats restent rendus verbatim", containsAll(workspace,[
  "item.clinicalIndication||notProvided",
  "item.medicalNotes||notProvided",
  "item.resultText",
  "item.resultUnit",
  "item.referenceRange",
  "item.resultInterpretation",
  "item.sampleNotes",
  "row.testLabel",
  "row.resultText",
  "row.unit",
  "row.referenceRange",
  "event.summary",
]));
const forbiddenTranslationInputs = [
  "t(item.clinicalIndication", "t(item.medicalNotes", "t(item.resultText", "t(item.resultUnit", "t(item.referenceRange", "t(item.resultInterpretation", "t(item.sampleNotes", "t(event.summary", "t(row.resultText",
  "healthClinicalT(locale,item.clinicalIndication", "healthClinicalT(locale,item.medicalNotes", "healthClinicalT(locale,item.resultText", "healthClinicalT(locale,item.referenceRange", "healthClinicalT(locale,item.resultInterpretation", "healthClinicalT(locale,event.summary",
];
check("Laboratoire #496: aucune donnée libre n'est transformée en clé de traduction", !forbiddenTranslationInputs.some((token)=>workspace.includes(token)));
check("Laboratoire #496: anciennes copies système françaises absentes", ![
  "Demandes du jour",
  "Prélèvements à faire",
  "Résultats validés",
  "Aucune demande laboratoire enregistrée pour cette entreprise.",
  "Marquer prélèvement effectué",
  "Ajouter un examen au catalogue",
].some((literal)=>workspace.includes(literal)));
check("Laboratoire #496: aucun formatage de locale FR local historique", !workspace.includes('toLocaleLowerCase("fr")') && !workspace.includes('new Intl.DateTimeFormat("fr-FR"'));
check("Laboratoire #496: responsive et aides conservés", containsAll(workspace,["h-[94dvh]","CircleHelp","min-w-0","overflow-x-hidden","ListControls","ActionMenu"]));
check("Laboratoire #496: aucune confirmation navigateur bloquante", !workspace.includes("window.prompt") && !workspace.includes("window.confirm"));

if (failures.length) {
  console.error(`FAIL i18n Health Laboratory #496 — ${failures.length} contrôle(s) en échec.`);
  process.exit(1);
}
console.log(`PASS i18n Health Laboratory #496 — ${frKeys.length} clés FR/EN symétriques, copie système convergée et données cliniques/résultats préservés verbatim.`);
