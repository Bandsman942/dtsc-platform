import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import ts from "typescript";

// Execute the real TypeScript crypto functions without a new production dependency.
const source = readFileSync(new URL("../lib/auth/totp.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const mod = { exports: {} };
new Function("require", "module", "exports", transpiled.outputText)(createRequire(import.meta.url), mod, mod.exports);
const totp = mod.exports;

const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // RFC 6238 SHA-1 test secret
const vectors = [
  [59, "287082"], [1111111109, "081804"], [1111111111, "050471"],
  [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"],
];
for (const [timestamp, code] of vectors) {
  const step = Math.floor(timestamp / 30);
  assert.equal(totp.generateTotpCode(secret, step), code, "RFC 6238 vector: " + timestamp);
  assert.equal(totp.verifyTotpCode(secret, code, { nowMs: timestamp * 1000, windowSteps: 0 }), step);
  assert.equal(totp.verifyTotpCode(secret, code, { nowMs: timestamp * 1000, lastAcceptedStep: step }), null);
}
assert.equal(totp.verifyTotpCode(secret, "1234567", { nowMs: 59000 }), null);
assert.equal(totp.verifyTotpCode(secret, "abcdef", { nowMs: 59000 }), null);
assert.equal(totp.verifyTotpCode(secret, "287082", { nowMs: 90000 }), null);
assert.throws(() => totp.decodeBase32("INVALID!!"));
assert.throws(() => totp.verifyTotpCode(secret, "287082", { windowSteps: 4 }));

const generated = totp.generateTotpSecret();
assert.equal(totp.decodeBase32(generated).length, 20);
assert.equal(totp.encodeBase32(totp.decodeBase32(generated)), generated);
const uri = new URL(totp.getTotpProvisioningUri(generated, "Member@Example.com"));
assert.equal(uri.protocol, "otpauth:");
assert.equal(uri.searchParams.get("issuer"), "DTSC Platform");
assert.equal(uri.searchParams.get("digits"), "6");
assert.equal(uri.searchParams.get("period"), "30");

const key = randomBytes(32);
const sealed = totp.encryptTotpSecret(generated, key);
assert.notEqual(sealed.includes(generated), true);
assert.equal(totp.decryptTotpSecret(sealed, key), generated);
assert.throws(() => totp.decryptTotpSecret(sealed, randomBytes(32)));
const parts = sealed.split(".");
parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
assert.throws(() => totp.decryptTotpSecret(parts.join("."), key));
assert.throws(() => totp.encryptTotpSecret(generated, randomBytes(16)));

const backupCodes = totp.generateRecoveryCodes(10);
assert.equal(new Set(backupCodes).size, 10);
for (const code of backupCodes) {
  assert.match(code, /^[A-Z2-7]{4}(-[A-Z2-7]{4}){4}$/);
  assert.equal(totp.hashRecoveryCode(code), totp.hashRecoveryCode(code.toLowerCase().replace(/-/g, "")));
  assert.equal(totp.hashRecoveryCode(code).length, 64);
}
assert.equal(totp.hashRecoveryCode("123456"), null);
assert.throws(() => totp.generateRecoveryCodes(100));

const schema = readFileSync(new URL("../prisma/auth-security.prisma", import.meta.url), "utf8");
const migration = readFileSync(new URL("../prisma/migrations/20261102142000_auth_totp_foundation/migration.sql", import.meta.url), "utf8");
assert.ok(schema.includes("model AuthTotpFactor"));
assert.ok(schema.includes("model AuthRecoveryCode"));
assert.ok(migration.includes('REFERENCES "User"("id")'));
assert.ok(migration.includes('CREATE TABLE "AuthRecoveryCode"'));
const consumption = readFileSync(new URL("../lib/auth/totp-factor-service.ts", import.meta.url), "utf8");
assert.ok(consumption.includes("updateMany"), "database-backed compare-and-swap required for replay protection");
assert.ok(consumption.includes("lastAcceptedStep"));
assert.ok(consumption.includes("consumedAt: null"));
console.log("AUTH-01 TOTP: RFC 6238, encryption, recovery codes, replay guards, additive schema OK");
