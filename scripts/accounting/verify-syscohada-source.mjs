import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const source = arg("--source");
const expectedSha256 = arg("--expected-sha256");

if (!source) {
  console.error("Usage: node scripts/accounting/verify-syscohada-source.mjs --source <official-file> [--expected-sha256 <sha256>]");
  process.exit(2);
}

const absolutePath = path.resolve(process.cwd(), source);
if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
  console.error(`Source file not found: ${absolutePath}`);
  process.exit(2);
}

const bytes = fs.readFileSync(absolutePath);
if (bytes.length === 0) {
  console.error("Source file is empty");
  process.exit(2);
}

const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
if (expectedSha256 && sha256.toLowerCase() !== expectedSha256.toLowerCase()) {
  console.error(`SHA-256 mismatch: expected ${expectedSha256}, got ${sha256}`);
  process.exit(1);
}

const evidence = {
  fileName: path.basename(absolutePath),
  sha256,
  sizeBytes: bytes.length,
  verifiedAt: new Date().toISOString(),
};

console.log(JSON.stringify(evidence, null, 2));
