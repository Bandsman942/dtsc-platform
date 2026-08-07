import { spawnSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const regression = packageJson?.scripts?.["qa:regression"];
if (!regression || typeof regression !== "string") {
  console.error("::error title=Regression QA::package.json ne contient pas le script qa:regression.");
  process.exit(1);
}

const commands = regression.split(/\s+&&\s+/).map((item) => item.trim()).filter(Boolean);
const escapeAnnotation = (value) => String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");

for (const [index, command] of commands.entries()) {
  console.log(`\n[regression ${index + 1}/${commands.length}] ${command}`);
  const result = spawnSync(command, {
    cwd: process.cwd(),
    env: process.env,
    shell: true,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    const output = `${result.stderr || ""}\n${result.stdout || ""}`.trim();
    const tail = output.split(/\r?\n/).filter(Boolean).slice(-8).join(" | ") || `exit code ${result.status ?? "unknown"}`;
    console.error(`::error title=Regression QA ${index + 1}/${commands.length}::${escapeAnnotation(`${command} — ${tail}`)}`);
    process.exit(result.status || 1);
  }
}

console.log(`\nRegression QA réussie: ${commands.length} commandes.`);
