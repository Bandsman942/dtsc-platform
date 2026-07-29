import fs from "node:fs";

function replace(file, from, to, label) {
  const current = fs.readFileSync(file, "utf8");
  if (current.includes(to)) return false;
  if (!current.includes(from)) throw new Error(`Missing target: ${label} in ${file}`);
  fs.writeFileSync(file, current.replace(from, to), "utf8");
  console.log(`updated: ${label}`);
  return true;
}

let changed = false;

changed = replace(
  "lib/work-schedule.ts",
  `  "ABSENCE",\n  "LEAVE",\n  "SICKNESS",`,
  `  "ABSENCE",\n  "ADMINISTRATIVE_ABSENCE",\n  "OTHER_ABSENCE",\n  "LEAVE",\n  "SICKNESS",`,
  "add controlled administrative and other absence types",
) || changed;

changed = replace(
  "lib/work-schedule.ts",
  `  ABSENCE: "Absent",\n  LEAVE: "Congé",`,
  `  ABSENCE: "Absence personnelle",\n  ADMINISTRATIVE_ABSENCE: "Absence administrative",\n  OTHER_ABSENCE: "Autre absence",\n  LEAVE: "Congé",`,
  "map absence types to distinct operational labels",
) || changed;

changed = replace(
  "lib/work-schedule.ts",
  `  Absent: "ABSENCE",\n  "Absence personnelle": "ABSENCE",\n  "Absence administrative": "ABSENCE",`,
  `  Absent: "ABSENCE",\n  "Absence personnelle": "ABSENCE",\n  "Absence administrative": "ADMINISTRATIVE_ABSENCE",\n  "Autre absence": "OTHER_ABSENCE",`,
  "round-trip distinct absence labels",
) || changed;

changed = replace(
  "lib/work-schedule.ts",
  `  const targetPositions = ["ABSENCE", "LEAVE", "SICKNESS", "UNAVAILABLE"].includes(exceptionType)\n    ? ["COO", "HR_CFO"]`,
  `  const absenceTypes = ["ABSENCE", "ADMINISTRATIVE_ABSENCE", "OTHER_ABSENCE", "LEAVE", "SICKNESS", "UNAVAILABLE"];\n  const targetPositions = absenceTypes.includes(exceptionType)\n    ? ["COO", "HR_CFO"]`,
  "notify managers for all controlled absence types",
) || changed;

changed = replace(
  "lib/work-schedule.ts",
  `  const label = ["ABSENCE", "LEAVE", "SICKNESS", "UNAVAILABLE"].includes(exceptionType) ? "une absence" : "une exception de planning";`,
  `  const label = absenceTypes.includes(exceptionType) ? "une absence" : "une exception de planning";`,
  "keep push copy generic for all absences",
) || changed;

changed = replace(
  "lib/work-schedule.ts",
  `  return ["Absent", "Congé", "Maladie", "Absence personnelle", "Absence administrative", "Indisponible"].includes(status);`,
  `  return ["Absent", "Congé", "Maladie", "Absence personnelle", "Absence administrative", "Autre absence", "Indisponible"].includes(status);`,
  "block other absence in effective resolver",
) || changed;

changed = replace(
  "components/calendar/dtsc-work-schedule-panel.tsx",
  `const absenceTypes = new Set(["ABSENCE", "LEAVE", "SICKNESS", "UNAVAILABLE"]);\nconst exceptionTypes = ["MISSION", "TRAINING", "REMOTE_WORK", "EXTRA_AVAILABILITY", "OTHER"];\nconst absenceTypeOptions = ["ABSENCE", "LEAVE", "SICKNESS", "UNAVAILABLE", "OTHER"];`,
  `const absenceTypes = new Set(["ABSENCE", "ADMINISTRATIVE_ABSENCE", "OTHER_ABSENCE", "LEAVE", "SICKNESS", "UNAVAILABLE"]);\nconst exceptionTypes = ["MISSION", "TRAINING", "REMOTE_WORK", "EXTRA_AVAILABILITY", "OTHER"];\nconst absenceTypeOptions = ["ABSENCE", "ADMINISTRATIVE_ABSENCE", "LEAVE", "SICKNESS", "UNAVAILABLE", "OTHER_ABSENCE"];`,
  "keep absence and exception UI categories disjoint",
) || changed;

changed = replace(
  "components/calendar/dtsc-work-schedule-panel.tsx",
  `  ABSENCE: { fr: "Absence personnelle", en: "Personal absence" },\n  LEAVE: { fr: "Congé", en: "Leave" },`,
  `  ABSENCE: { fr: "Absence personnelle", en: "Personal absence" },\n  ADMINISTRATIVE_ABSENCE: { fr: "Absence administrative", en: "Administrative absence" },\n  OTHER_ABSENCE: { fr: "Autre absence", en: "Other absence" },\n  LEAVE: { fr: "Congé", en: "Leave" },`,
  "add bilingual controlled absence labels",
) || changed;

changed = replace(
  "docs/DTSC_WORK_SCHEDULE.md",
  `- \`ABSENCE\`\n- \`LEAVE\``,
  `- \`ABSENCE\`\n- \`ADMINISTRATIVE_ABSENCE\`\n- \`OTHER_ABSENCE\`\n- \`LEAVE\``,
  "document controlled absence types",
) || changed;

console.log(changed ? "Sprint 3 absence types refined." : "Sprint 3 absence types already refined.");
