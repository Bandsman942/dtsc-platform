import fs from "node:fs";
import ts from "typescript";

const file = "components/enterprise/professional/retail-workspace-shared.tsx";
const source = fs.readFileSync(file, "utf8");
const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const replacements = [];
const diagnostics = [];

function visit(node) {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "useCallback" &&
    node.arguments.length >= 2
  ) {
    const callback = node.arguments[0];
    const deps = node.arguments[1];
    if (ts.isArrayLiteralExpression(deps)) {
      const callbackText = callback.getText(sf);
      const dependencyNames = deps.elements.map((element) => element.getText(sf));
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      diagnostics.push({ line, dependencyNames, usesLocale: /\blocale\b/.test(callbackText) });
      if (/\blocale\b/.test(callbackText) && !dependencyNames.includes("locale")) {
        const insertAt = deps.end - 1;
        const prefix = deps.elements.length ? ", " : "";
        replacements.push({ start: insertAt, end: insertAt, text: `${prefix}locale` });
      }
    }
  }
  ts.forEachChild(node, visit);
}
visit(sf);

console.log("useCallback dependency audit:");
for (const item of diagnostics) console.log(`- line ${item.line}: locale=${item.usesLocale ? "used" : "unused"}; deps=[${item.dependencyNames.join(", ")}]`);
console.log(`hook repairs=${replacements.length}`);

let output = source;
for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
  output = output.slice(0, replacement.start) + replacement.text + output.slice(replacement.end);
}
if (output !== source) fs.writeFileSync(file, output);

const mobileFile = "components/enterprise/professional/mobile-money-agency-workspace.tsx";
let mobile = fs.readFileSync(mobileFile, "utf8");
const unusedCatch = "    } catch (error) {\n      setPreviewError(copy.fxMissingRate);";
const cleanCatch = "    } catch {\n      setPreviewError(copy.fxMissingRate);";
if (!mobile.includes(unusedCatch) && !mobile.includes(cleanCatch)) throw new Error("Expected Mobile Money FX preview catch block not found.");
if (mobile.includes(unusedCatch)) {
  mobile = mobile.replace(unusedCatch, cleanCatch);
  fs.writeFileSync(mobileFile, mobile);
  console.log("Removed unused Mobile Money FX preview catch binding.");
}
