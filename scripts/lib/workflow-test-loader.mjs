import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

// Executes the actual TypeScript modules. Only explicit domain/service boundaries
// are substituted by the caller; database queries and transactions stay real.
export function workflowTestLoader(overrides) {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const cache = new Map();
  function load(specifier) {
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
    if (!specifier.startsWith("@/")) return require(specifier);
    const stem = path.join(process.cwd(), specifier.slice(2));
    const filename = [stem + ".ts", path.join(stem, "index.ts")].find((candidate) => fs.existsSync(candidate));
    if (!filename) throw new Error(`Test module not found: ${specifier}`);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInThisContext(`(function(require, module, exports) {\n${output}\n})`, { filename })(load, loaded, loaded.exports);
    return loaded.exports;
  }
  return load;
}
