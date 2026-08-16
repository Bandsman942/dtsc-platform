import fs from "node:fs";

const file = "scripts/codex-367-rewrite.mjs";
let source = fs.readFileSync(file, "utf8");
const from = '  if (fn.parameters?.some((param) => ts.isIdentifier(param.name) && param.name.text === "locale")) return true;';
const to = '  if (fn.parameters?.some((param) => /\\blocale\\b/.test(param.name.getText()))) return true;';
if (!source.includes(from)) throw new Error("Expected locale-scope detector not found.");
source = source.replace(from, to);
fs.writeFileSync(file, source);
console.log("Patched locale scope detection for destructured function parameters.");
