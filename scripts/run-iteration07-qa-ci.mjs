import { spawnSync } from "node:child_process";
import process from "node:process";

const commands = [
  "node scripts/qa-standard-dtsc-console-checks.mjs",
  "node scripts/qa-console-support-harmonization.mjs",
];

const escapeAnnotation = (value) => String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");

function diagnostic(output, status) {
  const lines = String(output || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const failures = lines.filter((line) => /^(FAIL|✗|Error:|AssertionError|Fichier introuvable:)/i.test(line));
  const hints = lines.filter((line) => /contrat absent|interdit|attendu|missing|absent|échoué|non canonique/i.test(line));
  const selected = [...failures, ...hints].filter((line, index, all) => all.indexOf(line) === index).slice(0, 16);
  return selected.join(" | ") || lines.slice(-12).join(" | ") || `exit code ${status ?? "unknown"}`;
}

for (const [index, command] of commands.entries()) {
  console.log(`\n[iteration07 ${index + 1}/${commands.length}] ${command}`);
  const result = spawnSync(command, { cwd: process.cwd(), env: process.env, shell: true, encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    const output = `${result.stderr || ""}\n${result.stdout || ""}`.trim();
    console.error(`::error title=Itération 07 Console QA ${index + 1}/${commands.length}::${escapeAnnotation(`${command} — ${diagnostic(output, result.status)}`)}`);
    process.exit(result.status || 1);
  }
}

console.log("\nItération 07 Console QA réussie.");
