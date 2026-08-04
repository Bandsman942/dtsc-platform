import fs from "node:fs";

const path = "components/calendar/internal-calendar-workspace-v2.tsx";
const original = fs.readFileSync(path, "utf8");
const source = ">Annuler l'événement</Button>";
const replacement = ">Annuler l’événement</Button>";
if (!original.includes(source)) throw new Error("Expected calendar button label not found.");
const updated = original.replace(source, replacement);
fs.writeFileSync(path, updated);
console.log("Final calendar lint fix applied.");
