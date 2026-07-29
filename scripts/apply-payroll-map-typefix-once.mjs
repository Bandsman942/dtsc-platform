import fs from "node:fs";

const path = "lib/payroll-workflow.ts";
const source = fs.readFileSync(path, "utf8");
const from = ".map(serializePayroll);";
const occurrences = source.split(from).length - 1;
if (occurrences !== 1) throw new Error(`Expected one serializePayroll map shortcut, found ${occurrences}`);
fs.writeFileSync(path, source.replace(from, ".map((payroll) => serializePayroll(payroll));"), "utf8");
console.log("Payroll serialize map typefix applied.");
